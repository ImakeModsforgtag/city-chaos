// CITY CHAOS - the CITY BANK, the vault heist and jobs (shared rules for the server and the browser).

export const BANK = {
  interestDay: 0.02,       // savings grow 2% per real day (compounding), even while you're offline
  interestCapDay: 1000,    // ...but at most $1000 of interest a day
  deathLoss: 0.10,         // knocked out by another player: they grab 10% of the cash you carry
  deathLossMax: 300,
  arrestLoss: 0.25,        // arrested: police confiscate 25% of the cash you carry (half goes to the cop)
  heist: {
    drillTime: 15,         // seconds of drilling to crack the vault door
    decay: 1.5,            // stop drilling longer than this and the drill cools down (progress drains)
    loot: [700, 1100],     // cash in each of the 3 stacks inside the vault
    openTime: 90,          // seconds the vault stays open
    cooldown: 480,         // lockdown after the vault closes (8 min)
    escape: 120,           // get this far from the bank with the loot to keep it
    wantedDrill: 1, wantedOpen: 1, wantedGrab: 1, xp: 150   // stars: alarm, vault cracked, cash grabbed
  }
};

// interest owed on a balance after `ms` milliseconds: { gain, used } (used = ms that were paid for)
export function bankInterest(balance, ms) {
  if (balance <= 0 || ms <= 0) return { gain: 0 };
  const days = ms / 86400000;
  const gain = Math.min(balance * (Math.pow(1 + BANK.interestDay, days) - 1), BANK.interestCapDay * days);
  return { gain: Math.floor(gain) };
}

// bank teller menu (uses the store menu): deposit / withdraw. amount 0 = everything
export const BANK_ITEMS = [
  { id: 'dep100', name: 'Deposit $100', icon: '🏦', kind: 'deposit', amount: 100, price: 100 },
  { id: 'dep500', name: 'Deposit $500', icon: '🏦', kind: 'deposit', amount: 500, price: 500 },
  { id: 'depall', name: 'Deposit ALL', icon: '💰', kind: 'deposit', amount: 0, price: 0 },
  { id: 'wd100', name: 'Withdraw $100', icon: '💵', kind: 'withdraw', amount: 100, price: 0 },
  { id: 'wd500', name: 'Withdraw $500', icon: '💵', kind: 'withdraw', amount: 500, price: 0 },
  { id: 'wdall', name: 'Withdraw ALL', icon: '💸', kind: 'withdraw', amount: 0, price: 0 }
];

// ---------------------------------------------------------------- jobs (start them at the 💼 JOBS kiosk on the plaza)
export const JOBS = {
  delivery: { name: 'Food Delivery', icon: '📦', base: 50, perM: 0.8, xp: 40, timeBase: 35, timePerM: 0.3, reach: 3.2,
              about: 'Pick up an order at a food store and run it to a customer\'s door before it gets cold' },
  taxi: { name: 'Taxi Driver', icon: '🚕', base: 70, perM: 1.0, xp: 50, timeBase: 40, timePerM: 0.18, reach: 8, stopSpeed: 3,
          about: 'Grab a car, pick up a passenger waiting on the sidewalk and drive them where they want to go' }
};
export const JOB_ITEMS = [
  { id: 'delivery', name: JOBS.delivery.name, icon: JOBS.delivery.icon, kind: 'job', price: 0 },
  { id: 'taxi', name: JOBS.taxi.name, icon: JOBS.taxi.icon, kind: 'job', price: 0 },
  { id: 'quit', name: 'Quit my job', icon: '✖', kind: 'jobquit', price: 0 }
];
// what a finished job pays
export function jobPay(kind, dist, late) {
  const J = JOBS[kind];
  const pay = Math.round((J.base + J.perM * dist) / 5) * 5;
  return late ? Math.round(pay / 2 / 5) * 5 : pay;
}
export function jobTime(kind, dist) { const J = JOBS[kind]; return Math.round(J.timeBase + J.timePerM * dist); }
