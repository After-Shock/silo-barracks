'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const Ajv2020Module = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const Ajv2020 = Ajv2020Module.default || Ajv2020Module;
const fixtureRoot = path.join(__dirname, 'fixtures', 'silo-v2');

function readJSON(name) {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, name), 'utf8'));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function createValidator(schemas) {
  const ajv = new Ajv2020({
    allErrors: true,
    coerceTypes: false,
    useDefaults: false,
    strict: true,
  });
  addFormats(ajv);
  // Huma's human-readable pattern annotation adds no validation semantics.
  ajv.addKeyword({ keyword: 'patternDescription', schemaType: 'string', valid: true });
  // OpenAPI's int64/double formats are annotations, not additional runtime
  // constraints for these JSON fixtures.
  ajv.addFormat('int64', true);
  ajv.addFormat('double', true);
  for (const [name, schema] of Object.entries(schemas)) {
    ajv.addSchema(schema, `#/components/schemas/${name}`);
  }
  return ajv;
}

function clone(value) {
  return structuredClone(value);
}

test('v2 contract subset is pinned to the upstream revision and self-consistent', () => {
  const manifest = readJSON('manifest.json');
  const schemaArtifact = fs.readFileSync(path.join(fixtureRoot, manifest.schema_artifact.path));
  const schemaDocument = JSON.parse(schemaArtifact);

  assert.equal(manifest.source.revision, '26661d76f451ed790cf74221538b1048a8d193d6');
  assert.equal(manifest.source.path, 'contracts/api/v2/openapi.json');
  assert.match(manifest.source.url, new RegExp(manifest.source.revision));
  assert.equal(manifest.source.sha256, 'e0cabb6c0a2535e05aab38cdc5823fa73dbf808ebff17332d7d372947abe5310');
  assert.equal(manifest.source.digest, `sha256:${manifest.source.sha256}`);
  assert.equal(manifest.schema_artifact.sha256, sha256(schemaArtifact));
  assert.equal(manifest.schema_artifact.digest, `sha256:${manifest.schema_artifact.sha256}`);
  assert.equal(schemaDocument['x-source'].revision, manifest.source.revision);
  assert.equal(schemaDocument['x-source'].sha256, manifest.source.sha256);
  assert.equal(schemaDocument['x-source'].digest, manifest.source.digest);

  for (const [operationId, operation] of Object.entries(manifest.operations)) {
    assert.equal(operation.source.revision, manifest.source.revision, operationId);
    assert.match(operation.source.url, new RegExp(`${manifest.source.revision}.*#`), operationId);
    assert.ok(schemaDocument.paths[operation.path], `missing path for ${operationId}`);
    assert.ok(schemaDocument.paths[operation.path][operation.method.toLowerCase()], `missing method for ${operationId}`);
    assert.equal(schemaDocument.paths[operation.path][operation.method.toLowerCase()].operationId, operationId);
  }

  for (const [name, provenance] of Object.entries(manifest.schemas)) {
    assert.ok(schemaDocument.components.schemas[name], `missing schema ${name}`);
    assert.equal(provenance.source.revision, manifest.source.revision, name);
    assert.match(provenance.source.url, new RegExp(`${manifest.source.revision}.*#`), name);
  }
});

test('v2 synthetic success fixtures validate with coercion and defaults disabled', () => {
  const manifest = readJSON('manifest.json');
  const schemaDocument = readJSON(manifest.schema_artifact.path);
  const responses = readJSON('responses.json');
  const ajv = createValidator(schemaDocument.components.schemas);

  for (const fixture of Object.values(responses)) {
    for (const response of fixture.responses) {
      if (response.status < 200 || response.status >= 300 || !response.schema) continue;
      const validate = ajv.getSchema(`#/components/schemas/${response.schema}`);
      assert.ok(validate, `missing validator for ${response.schema}`);
      assert.equal(validate(response.body), true, `${fixture.operationId} response does not match ${response.schema}: ${JSON.stringify(validate.errors)}`);
    }
  }
});

test('v2 synthetic fixtures cover pagination, empty collections, unknown enum values, nullability and problem details', () => {
  const manifest = readJSON('manifest.json');
  const responses = readJSON('responses.json');
  assert.equal(responses.health.path, '/api/v1/health');
  assert.equal(responses.health.responses[0].body.status, 'ok');
  assert.equal(responses.listAdminPlaybackHistory.path, '/api/v2/admin/playback-history');
  assert.equal(responses.listHistory.path, '/api/v2/history');
  assert.ok(manifest.notes.some(note => note.includes('listAdminPlaybackSessions') && note.includes('above 100')));

  // The API-key profile selector must have one unambiguous primary profile.
  const primaryProfiles = responses.listProfiles.responses[0].body.items.filter(profile => profile.is_primary);
  assert.deepEqual(primaryProfiles.map(profile => profile.id), ['profile-primary']);

  // The schema advertises a 200-item maximum, but upstream LoadPage currently
  // rejects values above 100; this fixture keeps the discrepancy visible.
  for (const operationId of ['listAdminPlaybackSessions', 'listAdminUsers', 'listCatalogItems', 'listHistory', 'listAdminPlaybackHistory']) {
    const pages = responses[operationId].responses.filter(response => response.status === 200);
    assert.ok(pages.length >= 2, `${operationId} needs at least two pages`);
    assert.ok(pages[0].body.page.next_cursor, `${operationId} first page needs next_cursor`);
    assert.equal(pages.at(-1).body.page.has_more, false, `${operationId} terminal page should end pagination`);
    assert.equal('next_cursor' in pages.at(-1).body.page, false, `${operationId} terminal page should omit next_cursor`);
  }

  assert.equal(responses.emptyCollection.responses[0].body.items.length, 0);
  assert.equal(responses.unknownCatalogType.responses[0].body.type, 'future_media_kind');
  assert.equal(responses.nullableOptional.responses[0].body.access_group_id, null);
  assert.equal(responses.nullableOptional.responses[0].body.last_active_at, null);
  assert.equal(responses.problem.responses[0].body.status, 422);
  assert.ok(Array.isArray(responses.problem.responses[0].body.errors));
});

test('v2 intentionally corrupted fixtures fail for required fields, types and nulls', () => {
  const manifest = readJSON('manifest.json');
  const schemaDocument = readJSON(manifest.schema_artifact.path);
  const responses = readJSON('responses.json');
  const ajv = createValidator(schemaDocument.components.schemas);
  const invalidCases = [
    ['SystemInfo', responses.getSystemInfo.responses[0].body, body => { delete body.api_major; }],
    ['CatalogBrowseCollection', responses.listCatalogItems.responses[0].body, body => { body.items = 'not-an-array'; }],
    ['CatalogItemDetail', responses.getCatalogItem.responses[0].body, body => { body.content_id = null; }],
    ['Problem', responses.problem.responses[0].body, body => { body.status = '422'; }],
  ];

  for (const [schemaName, original, corrupt] of invalidCases) {
    const body = clone(original);
    corrupt(body);
    const validate = ajv.getSchema(`#/components/schemas/${schemaName}`);
    assert.ok(validate, `missing validator for ${schemaName}`);
    assert.equal(validate(body), false, `${schemaName} corruption unexpectedly validated`);
    assert.ok(validate.errors?.length, `${schemaName} corruption had no validation errors`);
  }
});
