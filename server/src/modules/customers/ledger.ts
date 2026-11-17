import { IGenericDatabaseClient } from '@/core/db'
export async function recordDeposit(
  client: IGenericDatabaseClient,
  orderId: number,
  amount: number,
  actorId: number,
) {
  const tx = (
    await client.query(
      `INSERT INTO salon_transactions(method_id,type_id,is_debit,description,value,created_at,order_id,ledger_kind,recorded_by)
  VALUES((SELECT id FROM payment_methods WHERE name='Não informado'),(SELECT id FROM transaction_types WHERE name='Recebimento de cliente'),false,'Sinal confirmado',$1,now(),$2,'deposit',$3) RETURNING id`,
      [amount, orderId, actorId],
    )
  ).rows[0]
  await client.query(
    'INSERT INTO salon_schedule_transactions(schedule_id,transaction_id,created_at) VALUES($1,$2,now())',
    [orderId, tx.id],
  )
}
