import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../../core/auth/useAuth'
import { bookingRequest } from '../booking/bookingApi'
import type { BookingSettings } from '../booking/bookingApi'
import '../booking/booking.css'
export default function BookingSettingsPage() {
  const { user } = useAuth()
  const [settings, setSettings] = useState<BookingSettings | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!user?.canManagePasswords) return
    const controller = new AbortController()
    bookingRequest<BookingSettings>('/booking/settings', {
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) setSettings(data)
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message)
      })
    return () => controller.abort()
  }, [user?.canManagePasswords])
  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      setSettings(
        await bookingRequest<BookingSettings>('/booking/settings', {
          method: 'PUT',
          body: JSON.stringify(settings),
        }),
      )
      setNotice(
        'Configurações salvas. As reservas existentes mantêm suas condições originais.',
      )
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to save settings.',
      )
    } finally {
      setBusy(false)
    }
  }
  if (!user?.canManagePasswords)
    return <p>Somente ADMIN ou MASTER pode configurar o agendamento.</p>
  return (
    <section className="dashboard-view booking-settings">
      <header className="dashboard-view-header">
        <div>
          <span className="salon-eyebrow">Reservas & sinal</span>
          <h1>Configurações da agenda</h1>
          <p>Defina as condições para garantir um horário no salão.</p>
        </div>
      </header>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!settings && !error && <p role="status">Carregando configurações…</p>}
      {settings && (
        <form onSubmit={save}>
          <fieldset disabled={busy}>
            <legend>Agendamento online</legend>
            <label>
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) =>
                  setSettings({ ...settings, enabled: e.target.checked })
                }
              />
              Permitir reservas pela página inicial
            </label>
            <label>
              Validade dos pacotes (meses)
              <input
                required
                type="number"
                min="1"
                max="24"
                step="1"
                value={settings.packageValidityMonths}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    packageValidityMonths: Number(e.target.value),
                  })
                }
              />
            </label>
            <p className="booking-note">
              Padrão: 1 mês a partir da aquisição. Novas condições valem apenas
              para novos pacotes. Pacotes não exigem sinal; o pagamento é
              registrado separadamente.
            </p>
            <label>
              Antecedência do sinal
              <select
                value={settings.depositDays}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    depositDays: Number(e.target.value),
                  })
                }
              >
                {[1, 2, 3].map((days) => (
                  <option key={days} value={days}>
                    {days} {days === 1 ? 'dia' : 'dias'} antes
                  </option>
                ))}
              </select>
            </label>
            <p>
              O prazo termina às 23h59 do dia limite, no horário de Brasília.
              Para sexta-feira com antecedência de 1 dia, o sinal deve ser
              confirmado até quinta às 23h59.
            </p>
            <label>
              Prazo para reservas próximas (horas)
              <input
                type="number"
                required
                min="1"
                max="24"
                step="1"
                value={settings.shortNoticeHours}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    shortNoticeHours: Number(event.target.value),
                  })
                }
              />
            </label>
            <p className="booking-note">
              Se a cliente reservar para hoje, ou quando a antecedência acima já
              tiver passado, ela terá esse prazo para o sinal. O limite nunca
              ultrapassa o início do atendimento. Os horários continuam
              disponíveis para reserva online.
            </p>
            <label>
              Forma de cálculo
              <select
                value={settings.depositType}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    depositType: e.target.value as 'fixed' | 'percent',
                  })
                }
              >
                <option value="percent">Percentual do valor combinado</option>
                <option value="fixed">Valor fixo em reais</option>
              </select>
            </label>
            <label>
              {settings.depositType === 'percent'
                ? 'Percentual (%)'
                : 'Valor do sinal (R$)'}
              <input
                required
                type="number"
                min="0.01"
                max={settings.depositType === 'percent' ? 100 : 99999}
                step="0.01"
                value={settings.depositValue}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    depositValue: Number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              Instruções para pagamento
              <textarea
                required={settings.enabled}
                maxLength={2000}
                value={settings.paymentInstructions}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    paymentInstructions: e.target.value,
                  })
                }
                placeholder="Informe como a cliente deve pagar o sinal e entrar em contato com o salão."
              />
            </label>
            <p className="booking-note">
              A confirmação é manual. A equipe precisa registrar o recebimento
              na comanda. Nenhum e-mail é enviado. A equipe também pode combinar
              um prazo específico quando necessário.
            </p>
          </fieldset>
          <button className="primary-button" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar configurações'}
          </button>
        </form>
      )}
    </section>
  )
}
