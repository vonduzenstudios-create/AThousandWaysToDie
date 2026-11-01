import RAPIER from '@dimforge/rapier3d-compat';

export { RAPIER };

/** Collision group bits. */
export const G_WORLD = 0x0001;
export const G_PLAYER = 0x0002;
export const G_RAGDOLL = 0x0004;
export const G_PROP = 0x0008;
export const G_ALL = 0xffff;

/** Pack Rapier interaction groups: upper 16 bits = membership, lower 16 = filter. */
export const groups = (member: number, filter: number) => (((member & 0xffff) << 16) | (filter & 0xffff)) >>> 0;

/** Groups used by queries that should only see static level geometry. */
export const QUERY_WORLD = groups(G_ALL, G_WORLD);
