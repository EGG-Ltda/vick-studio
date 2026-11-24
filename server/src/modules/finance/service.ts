import { FinanceFilter, FinanceRecord, ProductRecord, previousPeriod, safeMoney } from '@/core/finance'
import { FinanceRepository } from './repository'
import { inject, injectable } from 'inversify'
import ExcelJS from 'exceljs'

function sum(values: number[]) { return values.reduce((total, value) => safeMoney(total + value), 0) }
function workedMinutes(rows: FinanceRecord[]): number | null {
  if (!rows.length || rows.some((row) => !row.actualStartedAt || !row.actualEndedAt)) return null
  const intervals = rows.map((row) => [Date.parse(row.actualStartedAt!), Date.parse(row.actualEndedAt!)]).sort((a,b) => a[0]-b[0])
  let [start, end] = intervals[0]
  let duration = 0
  for (const [nextStart, nextEnd] of intervals.slice(1)) {
    if (nextStart <= end) end = Math.max(end, nextEnd)
    else { duration += end-start; start=nextStart; end=nextEnd }
  }
  return (duration+end-start)/60000
}
export function summarize(rows: FinanceRecord[]) {
  const totalCents = sum(rows.map((row) => row.finalCents))
  const attendanceCount = new Set(rows.map((row) => row.scheduleId)).size
  const employees = [...new Set(rows.map((row) => row.employeeId))].map((id) => {
    const items = rows.filter((row) => row.employeeId === id)
    const minutes = workedMinutes(items)
    const cents = sum(items.map((row) => row.finalCents))
    return { id, name: items[0].employee, quantity: sum(items.map((row) => row.quantity)), totalCents: cents,
      minutes, hourlyCents: minutes && minutes > 0 ? Math.round(cents*60/minutes) : null,
      share: totalCents ? cents/totalCents*100 : null }
  })
  const minutes = employees.length && employees.every((employee) => employee.minutes !== null)
    ? employees.reduce((total, employee) => total + employee.minutes!, 0) : null
  return { totalCents, grossCents: sum(rows.map((row) => row.grossCents)), discountCents: sum(rows.map((row) => row.discountCents)),
    attendanceCount, quantity: sum(rows.map((row) => row.quantity)),
    ticketCents: attendanceCount ? Math.round(totalCents/attendanceCount) : null,
    minutes, hourlyCents: minutes && minutes > 0 ? Math.round(totalCents*60/minutes) : null, employees }
}
export function rankings(rows: { id: number; name: string; quantity: number; totalCents: number }[], sort: FinanceFilter['sort']) {
  const grouped = new Map<number, { id: number; name: string; quantity: number; totalCents: number }>()
  for (const row of rows) {
    const current = grouped.get(row.id)
    if (current) { current.quantity = safeMoney(current.quantity+row.quantity); current.totalCents = safeMoney(current.totalCents+row.totalCents) }
    else grouped.set(row.id, {...row})
  }
  const total = sum([...grouped.values()].map((row) => row.totalCents))
  return [...grouped.values()].sort((a,b) => (sort === 'value' ? b.totalCents-a.totalCents : b.quantity-a.quantity) || a.id-b.id)
    .map((row) => ({ ...row, share: total ? row.totalCents/total*100 : null }))
}

@injectable()
export class FinanceService {
  constructor(@inject(FinanceRepository) public readonly repository: FinanceRepository) {}

  async data(filter: FinanceFilter) {
    return this.repository.transaction(async (client) => {
      const previous = previousPeriod(filter.start,filter.end)
      const all = await this.repository.records(client, filter, previous.start)
      const rows = all.filter((row) => row.date >= filter.start)
      const before = summarize(all.filter((row) => row.date < filter.start))
      const summary = summarize(rows)
      const products: ProductRecord[] = await this.repository.productRecords(client, filter)
      const change = (current: number, old: number) => old ? (current-old)/old*100 : null
      return { rows, products, summary, previous: { ...previous, ...before },
        variation: { total: change(summary.totalCents,before.totalCents), quantity: change(summary.quantity,before.quantity),
          attendances: change(summary.attendanceCount,before.attendanceCount),
          ticket: before.ticketCents && summary.ticketCents !== null ? change(summary.ticketCents,before.ticketCents) : null },
        employees: [...summary.employees].sort((a,b) => (filter.sort==='value' ? b.totalCents-a.totalCents : b.quantity-a.quantity) || a.id-b.id),
        treatments: rankings(rows.map((row) => ({ id:row.treatmentId,name:row.treatment,quantity:row.quantity,totalCents:row.finalCents })),filter.sort),
        productRanking: rankings(products.map((row) => ({ id:row.productId,name:row.product,quantity:row.quantity,totalCents:row.finalCents })),filter.sort),
        productTotalCents: sum(products.map((row) => row.finalCents)),
      }
    })
  }

  async report(filter: FinanceFilter) {
    const { rows, products, ...data } = await this.data(filter)
    return { ...data, items: rows.slice(filter.page*20,filter.page*20+20), total: rows.length, pageSize:20,
      sales: [...new Map(products.map((product) => [product.saleId,{id:product.saleId,date:product.date}])).values()] }
  }

  async workbook(filter: FinanceFilter) {
    const data = await this.data(filter)
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Vick Florez'
    const sheet = workbook.addWorksheet('Procedimentos realizados')
    sheet.columns = [
      {header:'Data',key:'date',width:14},{header:'Funcionário',key:'employee',width:28},
      {header:'Cliente',key:'customer',width:28},{header:'Procedimento',key:'treatment',width:32},
      {header:'Quantidade',key:'quantity',width:14},{header:'Valor bruto',key:'gross',width:18},
      {header:'Desconto',key:'discount',width:18},{header:'Valor final',key:'final',width:18},
    ]
    for (const row of data.rows) sheet.addRow({date:new Date(`${row.date}T00:00:00Z`),employee:row.employee,customer:row.customer,
      treatment:row.treatment,quantity:row.quantity,gross:row.grossCents/100,discount:row.discountCents/100,final:row.finalCents/100})
    sheet.getColumn('date').numFmt='dd/mm/yyyy'
    for (const key of ['gross','discount','final']) sheet.getColumn(key).numFmt='"R$" #,##0.00'
    const employees = workbook.addWorksheet('Resumo por funcionário')
    employees.columns=[{header:'Funcionário',key:'name',width:30},{header:'Quantidade de procedimentos',key:'quantity',width:30},
      {header:'Valor total gerado',key:'total',width:24}]
    data.employees.forEach((row) => employees.addRow({name:row.name,quantity:row.quantity,total:row.totalCents/100}))
    employees.getColumn('total').numFmt='"R$" #,##0.00'
    const period=workbook.addWorksheet('Período e critérios')
    period.addRows([['Período',`${filter.start} a ${filter.end}`],['Funcionário (ID)',filter.employeeId ?? 'Todos'],
      ['Procedimento (ID)',filter.treatmentId ?? 'Todos'],['Busca',filter.search],['Regime','Procedimentos concluídos; não representa recebimentos'],
      ['Descontos','Informados por item; desconto geral deve ser rateado em centavos antes do registro.'],
      ['Total bruto',data.summary.grossCents/100],['Total desconto',data.summary.discountCents/100],['Total final',data.summary.totalCents/100]])
    period.getColumn(1).width=28; period.getColumn(2).width=100
    for(const number of [7,8,9]) period.getCell(number,2).numFmt='"R$" #,##0.00'
    for(const table of [sheet,employees]) {
      table.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,table.rowCount),column:table.columnCount}}
      table.views=[{state:'frozen',ySplit:1}]
      table.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}}
      table.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF17231E'}}
    }
    return workbook.xlsx.writeBuffer()
  }
}
