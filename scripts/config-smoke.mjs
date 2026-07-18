import assert from 'node:assert/strict';
import { productionConfigErrors } from '../server/config.mjs';

const valid={
  NODE_ENV:'production',PORT:'8787',PUBLIC_ORIGIN:'https://live.coachforlife.in',TRUST_PROXY:'true',
  DATABASE_URL:'postgresql://cfl_live:secret@postgres:5432/cfl_live',REDIS_URL:'redis://:secret@redis:6379',
  ADMIN_EMAIL:'owner@coachforlife.in',ADMIN_PASSWORD:'A-long-unique-secret-2026!',ORGANIZATION_SLUG:'coach-for-life',
};
assert.deepEqual(productionConfigErrors(valid),[],'Valid production configuration should pass');
const invalid={...valid,PUBLIC_ORIGIN:'http://localhost:8787',DATABASE_URL:'',REDIS_URL:'',ADMIN_PASSWORD:'CFLive@2026',ORGANIZATION_SLUG:'Coach For Life'};
const errors=productionConfigErrors(invalid);
assert(errors.length>=5,'Unsafe production configuration must be rejected');
console.log('Configuration smoke test passed: valid production settings accepted and unsafe origins, dependencies, passwords and slugs rejected.');
