// CITY CHAOS - street races. Drive any car (yours, a stolen one, a police car...) into the 🏁 start line on the
// avenue by the gas station: a race opens for 15 seconds so friends can line up too, then 3-2-1-GO.
// Hit every checkpoint in order. Solo: beat the target time to win. With friends: places pay.
export const RACE_START = [56, -30];          // the 🏁 start / finish line (avenue next to the gas station)
export const RACE = { joinRadius: 9, cpRadius: 11, lobby: 15, countdown: 3, timeout: 200, outOfCar: 8, cooldown: 8,
                      xp: 60, winXp: 60, soloPrize: 150, prizes: [200, 100, 50], perRacer: 100 };
export const ROUTES = [
  { id: 'loop', name: 'CITY LOOP', par: 40,
    cps: [[56, 0], [0, 0], [0, 56], [-56, 56], [-56, 0], [-56, -56], [0, -56], [56, -56], RACE_START] },
  { id: 'tour', name: 'GRAND TOUR', par: 90,
    cps: [[56, -56], [112, -56], [112, 56], [56, 56], [56, 112], [-56, 112], [-56, 56], [-112, 56], [-112, -56], [-56, -56], [-56, -112], [56, -112], [56, -56], RACE_START] }
];
export const fmtRace = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60); return `${m}:${(s % 60).toFixed(1).padStart(4, '0')}`; };
export function racePrize(place, racers, route) {
  if (racers <= 1) return 0;   // solo prize depends on the time (see server)
  const base = RACE.prizes[place - 1] || 0;
  return place === 1 ? base + RACE.perRacer * (racers - 1) : base;
}
