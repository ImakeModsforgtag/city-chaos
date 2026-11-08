// Shared game constants.
export const MAX_HEALTH = 100;
export const RESPAWN_TIME = 5;           // seconds
export const MAX_PLAYERS = 8;
export const NET_SEND_RATE = 20;         // client state updates per second
export const SNAPSHOT_RATE = 20;         // server snapshots per second
export const RECONNECT_GRACE = 45;       // seconds a dropped player keeps their slot
export const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion

// Hitboxes are defined relative to the HEAD position (works for VR + desktop players)
export const HEAD_RADIUS = 0.22;
export const BODY_TOP = 0.32;            // meters below head center
export const BODY_BOTTOM = 0.95;
export const BODY_RADIUS = 0.3;

export const MODES = {
  ffa: { name: 'Free For All', killLimit: 25, timeLimit: 600, teams: false },
  tdm: { name: 'Team Deathmatch', killLimit: 50, timeLimit: 600, teams: true }
};

export const TEAM_COLORS = [0xff4d4d, 0x4d8dff];
export const TEAM_NAMES = ['RED', 'BLUE'];

// Cosmetics catalog (indices are sent over the network)
export const HEADS = ['Round', 'Boxy', 'Gem', 'Bean'];
export const BODIES = ['Chunky', 'Slim', 'Barrel', 'Robot'];
export const HATS = ['None', 'Cap', 'Top Hat', 'Beanie', 'Crown', 'Cowboy', 'Traffic Cone'];
export const GLASSES = ['None', 'Shades', 'Round', 'Visor', 'Monocle'];
export const BACKS = ['None', 'Backpack', 'Jetpack', 'Cape', 'Guitar'];
