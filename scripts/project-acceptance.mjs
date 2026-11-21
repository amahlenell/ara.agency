import assert from 'node:assert/strict';

export async function projectAcceptance({ request, json, cookie, db, prospect, authenticated, userId }) {
  const route = '/studio/api/projects/' + prospect.id;
  const role = value => db.query('update studio_users set role=$1 where auth_user_id=$2', [value, userId]);
  const currentVersion = async () => (await db.query("select to_jsonb(p)->>'updated_at' version from studio_prospects p where id=$1", [prospect.id])).rows[0].version;
  const details = { title: 'Fixture website delivery', scope: 'Deliver the agreed website concept for the fictional business.',
    next_step: 'Confirm delivery milestones', status: 'planned', assigned_to: null, due_on: '2027-02-01' };
  const convert = async (confirmed = true) => ({ details, confirmed, version: await currentVersion() });

  const unconfirmed = await convert(false);
  assert.equal((await request(route, 'POST', unconfirmed)).status, 401);
  assert.equal((await request(route, 'POST', unconfirmed, cookie)).status, 400);
  assert.equal((await request(route, 'POST', await convert(), cookie)).status, 409);
  await authenticated(async tx => {
    for (const stage of ['researching','audited','demo_in_progress','demo_ready','contacted','replied','proposal_sent','won']) {
      await tx.query('update studio_prospects set lifecycle_status=$1 where id=$2', [stage, prospect.id]);
    }
  });
  await assert.rejects(authenticated(tx => tx.query("insert into studio_projects(client_name) values('Fixture')")), /permission denied/);
  await role('editor');
  assert.equal((await request(route, 'POST', await convert(), cookie)).status, 403);
  await role('admin');
  const input = await convert();
  const reviewPage = await request('/studio/projects/new?prospect=' + prospect.id, 'GET', undefined, cookie);
  assert.equal(reviewPage.status, 200);
  assert.ok((await reviewPage.text()).includes('Approve and create project'));
  assert.equal((await request(route, 'POST', { ...input, version: '2000-01-01T00:00:00Z' }, cookie)).status, 409);
  const [first, second] = await Promise.all([request(route, 'POST', input, cookie), request(route, 'POST', input, cookie)]);
  const { project } = await json(first, 200);
  assert.equal((await json(second, 200)).project.id, project.id);

  const edit = '/studio/api/projects/' + project.id;
  const updated = await json(await request(edit, 'PATCH', { details: { ...details, status: 'completed' }, revision: 1 }, cookie), 200);
  assert.equal(updated.project.revision, 2);
  assert.equal((await request(edit, 'PATCH', { details, revision: 1 }, cookie)).status, 409);
  await role('editor');
  assert.equal((await request(edit, 'PATCH', { details, revision: 2 }, cookie)).status, 403);
  await role('admin');

  for (const [path, expected] of [['/studio/projects',details.title], ['/studio/projects/'+project.id,details.scope], ['/studio/prospects/'+prospect.id,details.title]]) {
    const response = await request(path, 'GET', undefined, cookie);
    assert.equal(response.status, 200);
    assert.ok((await response.text()).includes(expected), path);
  }
  const record = await db.query("select new_state,metadata from studio_activity_log where action='project_convert'");
  assert.equal(record.rows.length, 1);
  assert.equal(record.rows[0].metadata.project_id, project.id);
  assert.ok(!JSON.stringify(record.rows).includes(details.scope));
  console.log('Project acceptance passed: admin confirmation, won prospect, concurrent conversion, stale revisions, delivery updates, project reopening permissions and linked pages.');
}
