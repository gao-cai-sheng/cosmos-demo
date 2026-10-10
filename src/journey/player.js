// Single-player identity. Names never serve as simulation or task IDs.
export const PLAYER_ID = 'player';
export function cleanPlayerName(value) {
  return typeof value === 'string' ? value.normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu, '').trim() : '';
}
export function normalizePlayer(raw) {
  const value = cleanPlayerName(raw?.displayName);
  return { id: PLAYER_ID, displayName: value && Array.from(value).length <= 24 ? value : '陈砚' };
}
export function playerLine(text, player) {
  return String(text ?? '').replaceAll('{playerName}', normalizePlayer(player).displayName);
}
