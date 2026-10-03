import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { generateWorkPreviews, serveDemos, viewport } from "./generate-work-previews.mjs";

const git = (cwd, ...args) => {
  const result = spawnSync('git', args, {cwd, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
};
test('fresh committed demo updates regenerate valid desktop previews; capture failures fail clearly', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'webeyond-preview-test-'));
  const repo = join(temp, 'source'), assembled = join(temp, 'demos'), output = join(temp, 'previews');
  const manifest = [{id:'fixture', route:'/demos/fixture/', screenshot:{output:'fixture-desktop.webp'}}];
  const hash = data => createHash('sha256').update(data).digest('hex');
  try {
    await mkdir(repo); await mkdir(assembled);
    git(repo, 'init', '-b', 'main');
    git(repo, 'config', 'user.name', 'Preview test'); git(repo, 'config', 'user.email', 'preview-test@example.invalid');
    const captureRevision = async (version, color) => {
      await writeFile(join(repo,'index.html'), `<html><body style="background:${color}"><h1>Committed fixture ${version}</h1></body></html>`);
      git(repo, 'add', 'index.html'); git(repo, 'commit', '-m', `Fixture ${version}`);
      await rm(join(assembled,'fixture'), {recursive:true,force:true});
      git(temp, 'clone', '--branch', 'main', repo, join(assembled,'fixture'));
      await generateWorkPreviews({demoDirectory:assembled,output,manifest});
      return readFile(join(output,'fixture-desktop.webp'));
    };
    const first = await captureRevision(1,'#ffffff');
    const second = await captureRevision(2,'#101010');
    assert.notEqual(hash(first), hash(second));
    const metadata = await sharp(second).metadata();
    assert.equal(metadata.format,'webp'); assert.equal(metadata.width,viewport.width); assert.equal(metadata.height,viewport.height);
    // Screenshot failures must not silently replace a valid output with a black placeholder.
    await writeFile(join(assembled,'fixture','index.html'), '<script>throw new Error("fixture broken")</script><h1>Broken</h1>');
    await assert.rejects(generateWorkPreviews({demoDirectory:assembled,output,manifest}), /Preview failed for fixture: Page error/);
    assert.equal(hash(await readFile(join(output,'fixture-desktop.webp'))),hash(second));
    const server = await serveDemos(assembled);
    try { assert.equal((await fetch(server.origin+'/admin/enquiries')).status,404); }
    finally { await server.close(); }
    // Only disposable cloned files were changed; the committed source is intact.
    assert.match(await readFile(join(repo,'index.html'),'utf8'), /Committed fixture 2/);
  } finally { await rm(temp,{recursive:true,force:true}); }
});
