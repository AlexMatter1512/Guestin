// Stable keys keep personal selections independent of language and room order.
export const defaultKrossFields = [
  "id_reservation",
  "channel",
  "name_reservation_status",
  "arrival",
  "departure",
  "sourceRooms",
  "n_guests",
  "tel",
];

const labels: Record<string, [string, string]> = {
  id_reservation: ["Reservation number", "Numero prenotazione"],
  channel: ["Booking source", "Canale di prenotazione"],
  name_reservation_status: ["Reservation status", "Stato prenotazione"],
  arrival: ["Arrival", "Arrivo"],
  departure: ["Departure", "Partenza"],
  sourceRooms: ["Source rooms", "Camere della prenotazione"],
  n_guests: ["Guests", "Ospiti"],
  tel: ["Phone", "Telefono"],
  email: ["Email", "Email"],
  label: ["Guest name", "Nome ospite"],
  notes: ["Reservation notes", "Note prenotazione"],
  plannerRoom: ["Planner room", "Camera nel planner"],
  cod_reservation: ["Booking reference", "Riferimento prenotazione"],
  date_reservation: ["Booked on", "Data prenotazione"],
  n_rooms: ["Number of rooms", "Numero di camere"],
  nights: ["Nights", "Notti"],
  cod_channel: ["Channel code", "Codice canale"],
  link_guest_portal: ["Guest portal link", "Link portale ospite"],
  link_check_in_instructions: [
    "Check-in instructions link",
    "Link istruzioni check-in",
  ],
  owner: ["Reservation owner", "Titolare prenotazione"],
  guest_portal: ["Guest portal", "Portale ospite"],
  n_beds: ["Beds", "Posti letto"],
  last_update: ["Last updated", "Ultimo aggiornamento"],
  date_expiration: ["Expiry date", "Data di scadenza"],
  date_cancelation: ["Cancellation date", "Data di cancellazione"],
  cod_reservation_status: ["Status code", "Codice stato"],
  tot_charge: ["Total charges", "Addebiti totali"],
  id_convenzione: ["Agreement ID", "ID convenzione"],
  id_package: ["Package ID", "ID pacchetto"],
  id_preventivo: ["Quote ID", "ID preventivo"],
  country_code: ["Country code", "Codice paese"],
  id_partitario: ["Ledger account ID", "ID partitario"],
  origine_lead: ["Lead source", "Origine lead"],
  metodo_acquisizione: ["Acquisition method", "Metodo di acquisizione"],
  id_motivo_viaggio: ["Travel purpose ID", "ID motivo del viaggio"],
  operatore: ["Operator", "Operatore"],
  long_stay: ["Long stay", "Soggiorno lungo"],
  id_agency: ["Agency ID", "ID agenzia"],
  cod_user: ["Payer code", "Codice pagante"],
  arrival_time: ["Expected arrival time", "Orario di arrivo previsto"],
  departure_time: ["Expected departure time", "Orario di partenza previsto"],
  check_out_anticipato: ["Early checkout", "Check-out anticipato"],
  tot_charge_no_tax: ["Total before tax", "Totale senza tasse"],
  tot_charge_tax: ["Total tax", "Totale tasse"],
  tot_charge_bed: ["Accommodation charges", "Totale pernottamento"],
  tot_charge_serv: ["Service charges", "Totale servizi"],
  tot_charge_cleaning: ["Cleaning charges", "Totale pulizie"],
  commissionamount: ["Commission collected", "Commissioni riscosse"],
  commissionamount_channel: [
    "Channel commission",
    "Commissioni trattenute dal canale",
  ],
  tot_charge_serv_no_vat: [
    "Service charges before VAT",
    "Totale servizi senza IVA",
  ],
  tot_charge_cleaning_no_vat: [
    "Cleaning charges before VAT",
    "Totale pulizie senza IVA",
  ],
  tot_charge_no_vat: ["Total before VAT", "Totale senza IVA"],
  tot_charge_bed_no_vat: [
    "Accommodation before VAT",
    "Totale pernottamento senza IVA",
  ],
  city_tax_to_pay: ["City tax due", "Tassa di soggiorno da pagare"],
  tot_bed_to_pay: ["Accommodation balance", "Pernottamento da pagare"],
  tot_charge_bed_cleaning: [
    "Accommodation and cleaning",
    "Pernottamento e pulizie",
  ],
  tot_charge_extra: ["Extra charges", "Costi extra"],
  tot_paid: ["Amount paid", "Importo pagato"],
  amount_to_pay: ["Amount due", "Da pagare"],
  advance_payment: ["Advance payment", "Acconto"],
  metodo_pagamento: ["Payment method", "Metodo di pagamento"],
  importo_fatturato: ["Amount invoiced", "Importo fatturato"],
  importo_da_fatturare: ["Amount to invoice", "Importo da fatturare"],
  data_scadenza_verifica_cc: [
    "Card verification deadline",
    "Scadenza verifica carta",
  ],
  data_scadenza_attesa_cc: ["Card waiting deadline", "Scadenza attesa carta"],
  tot_deposit: ["Security deposit", "Deposito cauzionale"],
  tot_paid_with_deposit: [
    "Amount paid including deposit",
    "Totale pagato con deposito",
  ],
  expected_payout: ["Expected payout", "Saldo previsto"],
  currency: ["Currency", "Valuta"],
  to_pay_guest: ["Guest balance", "Saldo ospite"],
  to_pay_ota: ["Channel balance", "Da pagare al canale"],
  rooms: ["Rooms", "Camere"],
  number: ["Number", "Numero"],
  name_room_type: ["Room type", "Tipo di camera"],
  name: ["Name", "Nome"],
};

export function fieldLabel(key: string, italian: boolean): string {
  return key
    .split("/")
    .map((part) =>
      Object.hasOwn(labels, part)
        ? labels[part][italian ? 1 : 0]
        : part.replaceAll("~1", "/").replaceAll("~0", "~").replaceAll("_", " "),
    )
    .join(" · ");
}

export const knownKrossFields = [
  ...Object.keys(labels).filter(
    (key) => !["rooms", "number", "name", "name_room_type"].includes(key),
  ),
  "rooms/number",
  "rooms/name_room_type",
  "rooms/name",
];

export type ReviewRow = [label: string, value: string, field?: string];
