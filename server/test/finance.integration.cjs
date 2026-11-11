// Run only against a disposable database: FINANCE_TEST_DATABASE_URL=... npm run test:finance
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { Pool } = require('pg')
const ExcelJS = require('exceljs')
require('reflect-metadata')

test('financial records, filters, precision, security, reversals and Excel agree', async () => {
  const url = process.env.FINANCE_TEST_DATABASE_URL
  assert.ok(url && new URL(url).pathname === '/finance_test', 'An isolated finance_test database is required')
  Object.assign(process.env, {
    DATABASE_CONNECTION_STRING:url,MASTER_USER_ID:'1',NODE_ENV:'test',JWT_TOKEN_ISSUER:'finance-test',JWT_TOKEN_AUDIENCE:'finance-test',
    JWT_TOKEN_ACCESS_EXP:'3600',JWT_TOKEN_REFRESH_EXP:'7200',JWT_TOKEN_ACCESS_TOPIC:'access',JWT_TOKEN_REFRESH_TOPIC:'refresh',JWT_TOKEN_SECRET:'isolated-finance-test-secret',
  })
  const pool = new Pool({connectionString:url,connectionTimeoutMillis:5000})
  let app
  let applicationPool
  try {
    const existing=await pool.query("SELECT to_regclass('public.app_users') AS users")
    assert.equal(existing.rows[0].users,null,'Test database must be empty; no existing data will be deleted')
    await pool.query(fs.readFileSync(path.join(__dirname,'../../db/init.sql'),'utf8'))
    const migration=fs.readFileSync(path.join(__dirname,'../../db/migrations/002_finance.sql'),'utf8')
    await pool.query(migration)
    await pool.query(migration)
    await pool.query(`INSERT INTO app_users(login,hash_password,email,is_active,created_at) VALUES
      ('master','test','master@example.com',true,NOW()),('reader','test','reader@example.com',true,NOW()),
      ('unauthorized','test','unauthorized@example.com',true,NOW());
      INSERT INTO persons(name,cpf_cnpj,is_pj,created_at) VALUES
      ('Ana','finance-employee-1',false,NOW()),('Bia','finance-employee-2',false,NOW()),('Cliente','finance-customer',false,NOW());
      INSERT INTO employees(person_id,user_id,created_at) VALUES (1,1,NOW()),(2,2,NOW());
      INSERT INTO customers(person_id,created_at) VALUES (3,NOW());
      INSERT INTO salon_treatments(name,description,price,duration_minutes,is_active,created_at) VALUES
      ('Manicure','Test treatment',100.25,60,true,NOW()),('Pedicure','Test treatment',200.10,60,true,NOW());
      INSERT INTO salon_schedules(customer_id,schedule_started_at,schedule_ended_at,no_treatments,created_at) VALUES
      (1,'2020-01-10 09:00','2020-01-10 10:00',24,NOW()),(1,'2019-12-10 09:00','2019-12-10 10:00',1,NOW()),
      (1,'2099-01-10 09:00','2099-01-10 10:00',1,NOW());
      INSERT INTO salon_schedule_treatments(employee_id,schedule_id,treatment_id,price)
      SELECT CASE WHEN n%2=0 THEN 2 ELSE 1 END,1,CASE WHEN n%2=0 THEN 2 ELSE 1 END,
      CASE WHEN n%2=0 THEN 200.10 ELSE 100.25 END FROM generate_series(1,24) n;
      INSERT INTO salon_schedule_treatments(employee_id,schedule_id,treatment_id,price) VALUES (1,2,1,100.25),(1,3,1,100.25);`)
    const {container,initializeDI}=require('../dist/di/bindings')
    initializeDI()
    applicationPool=container.get(require('../dist/core/db').databaseServiceId).pool
    const authService=container.get(require('../dist/core/auth').authServiceId)
    const cookie=(id)=>`accessToken=${authService.createAccessToken({id}).token}`
    app=require('fastify')()
    app.register(require('@fastify/cookie'))
    app.register(require('../dist/modules/finance/routes').default,{prefix:'/api'})
    app.register(require('../dist/modules/schedule/routes').default,{prefix:'/api'})
    app.register(require('../dist/modules/transactions/routes').default,{prefix:'/api'})
    app.setErrorHandler((error,_req,res)=>res.status(error.statusCode??500).send({success:false,message:error.message}))
    await app.ready()
    const request=(method,url,body,id=1)=>app.inject({method,url,headers:{cookie:cookie(id)},...(body?{payload:body}:{})})
    const params='start=2020-01-01&end=2020-01-31'
    const endpoint=`/api/finance/report?${params}`
    assert.equal((await app.inject({method:'GET',url:endpoint})).statusCode,401)
    assert.equal((await request('GET',endpoint,undefined,3)).statusCode,403)
    assert.equal((await request('GET','/api/transactions?page=0',undefined,3)).statusCode,403)
    assert.equal((await request('GET',`/api/finance/export?${params}`,undefined,3)).statusCode,403)
    assert.equal((await request('POST','/api/finance/products',{name:'Denied',priceCents:1},3)).statusCode,403)
    await pool.query(`INSERT INTO app_user_permissions(user_id,permission_id,created_at)
      SELECT 2,id,NOW() FROM app_permissions WHERE name='finance.read'`)
    assert.equal((await request('GET',endpoint,undefined,2)).statusCode,200)
    assert.equal((await request('GET',`/api/finance/export?${params}`,undefined,2)).statusCode,403)
    assert.equal((await request('POST','/api/finance/products',{name:'Denied',priceCents:1},2)).statusCode,403)
    assert.equal((await request('GET',endpoint)).json().data.summary.totalCents,0)
    for(let id=1;id<=24;id++) {
      const response=await request('POST','/api/finance/treatments',{scheduleItemId:id,performedOn:'2020-01-10',quantity:1,discountCents:25,
        actualStartedAt:'2020-01-10T12:00:00Z',actualEndedAt:'2020-01-10T13:00:00Z'})
      assert.equal(response.statusCode,200,response.body)
    }
    assert.equal((await request('POST','/api/finance/treatments',{scheduleItemId:25,performedOn:'2019-12-10',quantity:1})).statusCode,200)
    assert.equal((await request('POST','/api/finance/treatments',{scheduleItemId:1,performedOn:'2020-01-10'})).statusCode,409)
    assert.equal((await request('POST','/api/finance/treatments',{scheduleItemId:26,performedOn:'2099-01-10'})).statusCode,400)
    assert.equal((await request('GET','/api/finance/report?start=2020-02-30&end=2020-03-01')).statusCode,400)
    assert.equal((await request('GET',endpoint+'&search=%27%20OR%201%3D1--')).json().data.total,0)
    const data=(await request('GET',endpoint)).json().data
    const expected=12*10025+12*20010-24*25
    assert.equal(data.summary.totalCents,expected)
    assert.equal(data.summary.quantity,24)
    assert.equal(data.summary.attendanceCount,1,'A multi-professional attendance must be counted only once')
    assert.equal(data.summary.ticketCents,expected)
    assert.equal(data.summary.minutes,120,'Overlapping procedure durations must not multiply employee hours')
    assert.equal(data.previous.totalCents,10025)
    assert.equal(data.total,24)
    assert.equal(data.items.length,20)
    assert.equal((await request('GET',endpoint+'&page=1')).json().data.items.length,4)
    const employee=(await request('GET',endpoint+'&employeeId=1')).json().data
    assert.equal(employee.summary.quantity,12)
    assert.equal(employee.summary.totalCents,12*(10025-25))
    assert.equal((await request('GET',endpoint+'&treatmentId=2')).json().data.summary.totalCents,12*(20010-25))
    await pool.query("UPDATE salon_treatments SET price=999,name=name || ' updated'")
    assert.equal((await request('GET',endpoint)).json().data.summary.totalCents,expected,'Catalog changes must not change historical amounts')
    assert.equal((await request('GET',endpoint)).json().data.items[0].treatment,'Pedicure')
    const exported=await request('GET',`/api/finance/export?${params}&page=1`)
    assert.equal(exported.statusCode,200,exported.body)
    const workbook=new ExcelJS.Workbook()
    await workbook.xlsx.load(exported.rawPayload)
    const sheet=workbook.getWorksheet('Procedimentos realizados')
    assert.equal(sheet.rowCount,25,'Export must include every filtered row, not just the current page')
    assert.ok(sheet.autoFilter)
    let total=0
    sheet.eachRow((row,index)=>{if(index>1){assert.ok(row.getCell(1).value instanceof Date);assert.equal(typeof row.getCell(8).value,'number');total+=Math.round(row.getCell(8).value*100)}})
    assert.equal(total,expected)
    let employeesTotal=0
    workbook.getWorksheet('Resumo por funcionário').eachRow((row,index)=>{if(index>1)employeesTotal+=Math.round(row.getCell(3).value*100)})
    assert.equal(employeesTotal,total)
    const created=await request('POST','/api/finance/products',{name:'Óleo de cutícula',priceCents:1050})
    assert.equal(created.statusCode,200)
    const productId=created.json().data.id
    const sold=await request('POST','/api/finance/sales',{employeeId:1,customerId:1,soldOn:'2020-01-10',items:[{productId,quantity:3,discountCents:50}]})
    assert.equal(sold.statusCode,200,sold.body)
    assert.equal((await request('GET',endpoint)).json().data.productTotalCents,3100)
    assert.equal((await request('GET',endpoint+'&treatmentId=2')).json().data.productTotalCents,3100,'Treatment filter must not affect the separate product category')
    const badSale=await request('POST','/api/finance/sales',{employeeId:1,soldOn:'2020-01-10',items:[{productId,quantity:1,discountCents:999999}]})
    assert.equal(badSale.statusCode,400)
    assert.equal((await request('GET',endpoint)).json().data.productTotalCents,3100,'Failed sales must roll back completely')
    assert.equal((await request('POST',`/api/finance/sales/${sold.json().data.id}/reverse`,{reason:'Customer return'})).statusCode,200)
    assert.equal((await request('GET',endpoint)).json().data.productTotalCents,0)
    assert.equal((await request('POST','/api/finance/treatments/1/reverse',{reason:'Service cancelled'})).statusCode,200)
    assert.equal((await request('POST','/api/finance/treatments/1/reverse',{reason:'Repeat reversal'})).statusCode,404)
    const reversed=(await request('GET',endpoint)).json().data
    assert.equal(reversed.total,23)
    assert.equal(reversed.summary.totalCents,expected-10000)
    const schedule=await request('GET','/api/schedules?start=2020-01-01T00:00:00Z&end=2020-02-01T00:00:00Z')
    assert.equal(schedule.statusCode,200,schedule.body)
    assert.equal(schedule.json().data.filter(row=>row.status==='completed').length,23)
    assert.equal(new Set(schedule.json().data.map(row=>row.id)).size,24,'Every treatment item must have a separate identity')
    const options=await request('GET','/api/schedules/options')
    assert.equal(options.statusCode,200)
    assert.equal(options.json().data.employees.length,2)
    const newSchedule=await request('POST','/api/schedules',{customerId:1,employeeId:1,serviceId:1,
      startsAt:'2020-02-10T12:00:00Z',endsAt:'2020-02-10T13:00:00Z'})
    assert.equal(newSchedule.statusCode,200,newSchedule.body)
    assert.ok(newSchedule.json().data.scheduleId)
    const newItem=newSchedule.json().data.id
    assert.equal((await request('POST','/api/finance/treatments',{scheduleItemId:newItem,performedOn:'2020-02-10',quantity:0})).statusCode,400)
    assert.equal((await request('POST','/api/finance/treatments',{scheduleItemId:newItem,performedOn:'2020-02-10',discountCents:999999})).statusCode,400)
    const completeNew=await request('POST','/api/finance/treatments',{scheduleItemId:newItem,performedOn:'2020-02-10',quantity:2,discountCents:50})
    assert.equal(completeNew.statusCode,200,completeNew.body)
    const february=(await request('GET','/api/finance/report?start=2020-02-01&end=2020-02-29')).json().data
    assert.equal(february.summary.totalCents,199750)
    assert.equal(february.summary.quantity,2)
    assert.equal(february.summary.minutes,null,'Planned duration is not actual worked duration')
    await pool.query("UPDATE finance_treatment_records SET status='cancelled' WHERE id=2")
    assert.equal((await request('GET',endpoint)).json().data.summary.totalCents,expected-10000-19985)
    await pool.query("UPDATE finance_treatment_records SET status='completed' WHERE id=2")
    const filteredExport=await request('GET',`/api/finance/export?${params}&employeeId=1`)
    const filteredBook=new ExcelJS.Workbook()
    await filteredBook.xlsx.load(filteredExport.rawPayload)
    assert.equal(filteredBook.getWorksheet('Procedimentos realizados').rowCount,12)
    await pool.query('UPDATE app_users SET is_active=false WHERE id=2')
    assert.equal((await request('GET',endpoint,undefined,2)).statusCode,401)
    console.log('Verified: 24 rows / 2 professionals / 1 attendance; Excel totals, historical prices, products, reversals, filters and access controls.')
  } finally {
    if(app)await app.close()
    if(applicationPool)await applicationPool.end()
    await pool.end()
  }
})
