// CITY CHAOS - gang turf. Join a gang (pause menu / VR menu), then stand in one of the six turf zones
// (big colored rings with a flag) to take it over for your gang. The more of your gang in the ring, the faster.
// Owning turf pays everyone in the gang every minute. Cops standing in a ring clear it back to neutral.
export const GANGS = [
  null,
  { id: 1, name: 'RED FANGS', icon: '🔴', color: '#ff3b4e', hex: 0xff3b4e },
  { id: 2, name: 'BLUE SHARKS', icon: '🔵', color: '#3a86ff', hex: 0x3a86ff },
  { id: 3, name: 'GREEN VIPERS', icon: '🟢', color: '#2ec27e', hex: 0x2ec27e },
  { id: 4, name: 'GOLD CROWNS', icon: '🟡', color: '#ffd23f', hex: 0xffd23f }
];
export const COP_GANG = 5;   // "capturing" side for police clearing a turf
export const TURFS = [
  { id: 'park', name: 'CHAOS PARK', p: [-78, -28] },
  { id: 'court', name: 'THE COURTS', p: [-84, 28] },
  { id: 'yard', name: 'CONTAINER YARD', p: [28, 28] },
  { id: 'diner', name: 'DINER STRIP', p: [84, 28] },
  { id: 'site', name: 'CONSTRUCTION SITE', p: [84, 84] },
  { id: 'mega', name: 'MEGA MART LOT', p: [-28, -84] }
];
export const TURF = { radius: 9, capture: 20, maxMul: 3, decay: 8, payEvery: 60, payPer: 8, capCash: 60, capXp: 40, clearCash: 30, maxY: 5 };
export const gangOf = (g) => GANGS[g] || null;
