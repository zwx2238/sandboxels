// Fork cleanup regression test for the self-hosted Sandboxels build.
//
//   node test/fork-cleanup.cjs
//
// Zero dependencies. Two layers:
//   1. Static assertions on index.html / style.css: every promotional or
//      tracking path removed by this fork stays removed, every functional or
//      attribution surface this fork must keep is still present, and no
//      dangling references to deleted nodes remain (they would throw at
//      runtime).
//   2. A syntax check of every inline <script> block in index.html, so a bad
//      HTML edit cannot ship a broken page.
var fs = require('fs');
var path = require('path');
var os = require('os');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..');
var index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
var style = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');

var failures = 0;
function check(desc, ok) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + desc);
  if (!ok) failures++;
}
function absent(file, desc, needle) {
  check(desc + ' removed from ' + file, index.indexOf(needle) === -1 && (file === 'style.css' ? style.indexOf(needle) === -1 : true));
}

// --- promotional and tracking paths removed ---------------------------------
absent('index.html', 'Playlight SDK (any case reference)', 'playlight');
absent('index.html', 'Playlight remote SDK host', 'sdk.playlight.dev');
absent('index.html', 'Playlight utm trigger', 'utm_source');
absent('index.html', 'R74n Observer referrer cookie', 'R74nRef');
absent('index.html', 'Observer script comment', 'R74n Observer');
absent('index.html', 'newsletter block', 'news.r74n.com');
absent('index.html', 'Patreon link', 'patreon.com');
absent('index.html', 'moreSocial random social node', 'moreSocial');
absent('index.html', 'steamButton promo anchor', 'steamButton');
// The Discord invite may survive exactly once: the functional "Join Server"
// button of the saves browser's Discord tab. Every other occurrence (extra
// links nav, intro paragraph, obfuscated embed notice, discovery popup) is
// promo and must be gone.
var inviteCount = index.split('discord.gg/ejUc6YPQuS').length - 1;
check('Discord invite only kept for the saves Join Server button (exactly once)', inviteCount === 1 && index.indexOf('discord.gg/ejUc6YPQuS') > index.indexOf('saveWorkshopList'));
absent('index.html', 'business-inquiries promo paragraph', 'intro7');
absent('index.html', 'Discord community promo paragraph', 'intro6');
absent('index.html', 'Patreon thanks paragraph', 'patronThanks');
absent('index.html', 'More R74n games cross-promo', 'More R74n games');
absent('style.css', 'newsletter frame CSS', 'newsletterFrame');
absent('style.css', 'bottomTopBoxColumns CSS', 'bottomTopBoxColumns');

// --- functional surfaces preserved ------------------------------------------
var keptInIndex = [
  ['Changelog link', 'id="changelogButton"'],
  ['Feedback link', 'id="feedbackButton"'],
  ['Wiki link', 'id="wikiButton"'],
  ['Install Offline PWA button', 'id="install-button"'],
  ['intro description 1', 'id="intro1"'],
  ['intro description 5 (education)', 'id="intro5"'],
  ['Help link', 'sandboxels.R74n.com/help'],
  ['Tips link', 'sandboxels.R74n.com/tips'],
  ['Mods link', 'sandboxels.R74n.com/mod-list'],
  ['Mobile guide link', 'mobile-use'],
  ['Offline guide link', 'offline-use'],
  ['Press kit link', 'presskit'],
  ['Privacy link', 'R74n.com/privacy'],
  ['developer attribution', 'Sandboxels is developed by'],
  ['translation credit node', 'id="langCredit"'],
  ['self-hosted flag', 'const openGamesSelfHosted = true;'],
  ['ad loader gate (upstream parity when flag is off)', 'if (openGamesSelfHosted) return;'],
  ['Steam Workshop save: add click handler', 'handleWorkshopAddClick'],
  ['Steam Workshop save: loader', 'loadWorkshop'],
  ['Discord Activity detection', 'discord_port.js'],
  ['Discord saves feature', 'getDiscordSaves'],
  ['saves-menu Steam guidance (functional, not an ad)', 'savesGetOnSteam'],
  ['lang select moved into settings (standalone)', 'setting-span-lang']
];
keptInIndex.forEach(function (pair) {
  check(pair[0] + ' kept in index.html', index.indexOf(pair[1]) !== -1);
});

// element info descriptions must be untouched (Steam is a substance here)
check('element info mentions of steam (substance) untouched',
  index.indexOf('creating Basalt and Steam') !== -1);

// --- no dangling references to deleted nodes --------------------------------
['moreSocial', 'steamButton', 'patronThanks', 'newsletterFrame', 'intro6', 'intro7', 'bottomTopBoxColumns']
  .forEach(function (id) {
    var used = index.indexOf(id) !== -1 || style.indexOf(id) !== -1;
    check('no dangling reference to removed node #' + id, !used);
  });

// --- every inline <script> block still parses -------------------------------
var scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
var match, count = 0, syntaxErrors = 0;
var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandboxels-inline-'));
while ((match = scriptRe.exec(index)) !== null) {
  var attrs = match[1];
  var body = match[2];
  if (/type\s*=\s*["'](application\/ld\+json|text\/template)["']/.test(attrs)) continue;
  if (/\ssrc\s*=/.test(attrs)) continue;
  if (!body.trim()) continue;
  count++;
  var file = path.join(tmpDir, 'inline-' + count + '.js');
  fs.writeFileSync(file, body);
  var res = cp.spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (res.status !== 0) {
    syntaxErrors++;
    console.log('FAIL inline script #' + count + ' has a syntax error:');
    console.log((res.stderr || '').split('\n').slice(0, 4).join('\n'));
  }
}
check('all ' + count + ' inline scripts parse cleanly', syntaxErrors === 0);

fs.rmSync(tmpDir, { recursive: true, force: true });

if (failures > 0) {
  console.error(failures + ' check(s) failed');
  process.exit(1);
}
console.log('fork cleanup checks passed');
