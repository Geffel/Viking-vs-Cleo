import { readFile } from 'node:fs/promises';
import { achievementUnlockStats } from '../shared/achievements.js';

const fails = [];

function check(label, ok, extra = '') {
  console.log(`${ok ? 'OK  ' : 'FEL '} ${label}${extra ? '  ' + extra : ''}`);
  if (!ok) fails.push(label);
}

const stats = achievementUnlockStats([
  {
    achievements: { unlocked: { first_blood: 1 } },
  },
  {
    stats: { combat: { kills: 1 } },
    achievements: { unlocked: {} },
  },
  {
    stats: { combat: { kills: 0, deaths: 1 } },
    achievements: { unlocked: {} },
  },
]);

check('raknar totalt antal profiler', stats.totalProfiles === 3, String(stats.totalProfiles));
check('raknar explicit och implicit upplasta achievements', stats.unlocked.first_blood === 2, String(stats.unlocked.first_blood));
check('avrundar global procent till en decimal', stats.pcts.first_blood === 66.7, String(stats.pcts.first_blood));
check('achievements utan upplasning blir 0%', stats.pcts.team_player === 0, String(stats.pcts.team_player));

const emptyStats = achievementUnlockStats([]);
check('tom profillista ger 0 profiler', emptyStats.totalProfiles === 0, String(emptyStats.totalProfiles));
check('tom profillista ger 0%', emptyStats.pcts.first_blood === 0, String(emptyStats.pcts.first_blood));

const achievementsUi = await readFile(new URL('../public/js/achievements.js', import.meta.url), 'utf8');
const resultPreview = await readFile(new URL('../public/_result-preview.html', import.meta.url), 'utf8');
check('matchresultatet visar hogst fem achievement-slots',
  /MATCH_SUMMARY_SLOT_LIMIT\s*=\s*5/.test(achievementsUi)
    && /earned\.slice\(0, MATCH_SUMMARY_SLOT_LIMIT\)/.test(achievementsUi));
check('Show more oppnar hela achievements-vyn',
  /data-achievements-more/.test(achievementsUi)
    && /this\.onViewAll\(\)/.test(achievementsUi));
check('resultat-previewn kan visa alla viktiga achievements-lagen',
  ['0', '1', '5', '8'].every((count) => resultPreview.includes(`data-achievements="${count}"`)));

console.log('');
console.log(fails.length ? `${fails.length} TEST MISSLYCKADES: ${fails.join(', ')}` : 'ALLA TESTER OK');
process.exit(fails.length ? 1 : 0);
