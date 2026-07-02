// ╔══════════════════════════════════════════════════════════════╗
// ║  Bella Home GmbH - Firmenstammdaten für Rechnungen           ║
// ╚══════════════════════════════════════════════════════════════╝

module.exports = {
  // Firma
  name: 'Bella Home GmbH',
  street: 'Oberlaaerstraße 285',
  zip: '1230',
  city: 'Wien',
  country: 'Österreich',

  // Geschäftsführung
  gf: 'Yildiray Dagdelen',

  // Behörden-Nummern
  uid: 'ATU74825834',
  fn: 'FN 516088 d',
  court: 'Handelsgericht Wien',

  // Kontakt
  phone: '+43 660 200 06 44',
  email: 'info@bellahome.at',
  web: 'www.fliegengitterwien.at',

  // Bank
  bankName: 'Erste Bank',
  iban: 'AT25 2011 1847 7437 5600',
  bic: 'GIBAATWWXXX',
  accountHolder: 'Bella Home GmbH',

  // Steuer
  vatRate: 0.20, // 20% MwSt Österreich
  kleinunternehmer: false,

  // Email-Konfiguration
  emailFrom: 'Fliegengitter Wien <bestellung@fliegengitterwien.at>',
  emailReplyTo: 'bestellung@fliegengitterwien.at',
  adminEmail: 'bestellung@fliegengitterwien.at', // Wo Admin-Benachrichtigungen hingehen

  // URLs
  shopUrl: 'https://fliegengitterwien.at',
  trackingUrlBase: 'https://fliegengitterwien.at/#/bestellung/'
};
