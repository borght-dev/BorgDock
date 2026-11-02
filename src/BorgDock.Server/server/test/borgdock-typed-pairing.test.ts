import assert from 'node:assert/strict';
import test from 'node:test';
import { CODE_ALPHABET, newTypedSecret, typedPairingCode, typedPairingProof, typedProofMatches } from '../src/borgdock/connector-protocol.ts';

const deviceKey = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString('base64');

test('a typed code is the server code plus an eight-character secret from the code alphabet', () => {
  const secret = newTypedSecret();
  assert.match(secret, new RegExp(`^[${CODE_ALPHABET}]{8}$`));
  assert.equal(typedPairingCode('ABCD-EFGH', 'JKMNPQRS'), 'ABCD-EFGH-JKMN-PQRS');
});

test('the typed proof matches only its own secret and device key', () => {
  const proof = typedPairingProof('JKMNPQRS', deviceKey);
  // The iPhone app's PairingLink test checks the same value.
  assert.equal(proof, 'rQrqu/u1lOdifKRJYl18TJgHfxmIGEjzcJrQlb77UwQ=');
  assert.ok(typedProofMatches('JKMNPQRS', deviceKey, proof));
  assert.ok(!typedProofMatches('JKMNPQRT', deviceKey, proof));
  assert.ok(!typedProofMatches('JKMNPQRS', Buffer.alloc(65, 2).toString('base64'), proof));
  assert.ok(!typedProofMatches('JKMNPQRS', deviceKey, 'not base64 at all'));
});
