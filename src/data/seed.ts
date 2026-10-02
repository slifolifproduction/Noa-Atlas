/**
 * Sample atlas: one fictional person, about seven months of records.
 *
 * Noa is a freelance creative producer deciding whether to build a small
 * animation studio, move into an in-house role, or run a hybrid of the two.
 * Everything here is invented. Nothing is a diagnosis.
 *
 * The sample is written in the layered model:
 * - RECORD: 30 notes and 8 decisions in Noa's own words;
 * - HISTORY: the events, actions and experiences those notes report, dated,
 *   each traced to its note;
 * - MAP: elements in life areas (what Noa holds, does, and is surrounded by),
 *   with lifespans, and a few declared links;
 * - UNDERSTANDING: claims about what affects what, each with evidence of a
 *   kind (instances, contrasts, counter-cases, test results), so their
 *   statuses differ and are derived; patterns as regularities, explained by
 *   claims; loops that emerge where claims close a circle;
 * - POSSIBILITY: options not taken (some with imagined outcomes) and paths
 *   that list the claims they rely on.
 *
 * Dates are written against an anchor week and shifted by whole weeks at load
 * time, so the sample always reads as "recent" and weekly plans stay aligned.
 */
import { analyzeEntryLocally } from '../ai/localAnalysis';
import type {
  AreaKey,
  AtlasData,
  AtlasEdge,
  AtlasNode,
  Claim,
  Decision,
  Effect,
  ElementKind,
  Entry,
  Evidence,
  EvidenceKind,
  Experiment,
  FactorReading,
  LinkType,
  ModelUpdate,
  Occurrence,
  OccurrenceKind,
  Pattern,
  SourceRef,
  StrategicPath,
} from '../domain/types';
import { addDays, daysBetween, todayISO, weekStart } from '../lib/dates';

const ANCHOR_WEEK = '2026-09-28';

export function createSeedData(today: string = todayISO()): AtlasData {
  const offset = daysBetween(ANCHOR_WEEK, weekStart(today));
  const D = (date: string) => addDays(date, offset);
  const T = (date: string, time = '09:00:00') => `${D(date)}T${time}.000Z`;

  /* ------------------------------------------------------------ elements (map) */

  const nodes: Record<string, AtlasNode> = {};
  const el = (
    id: string,
    kind: ElementKind,
    area: AreaKey,
    label: string,
    summary: string,
    opts: Partial<Pick<AtlasNode, 'origin' | 'adopted' | 'since' | 'until' | 'concern' | 'external' | 'scale' | 'level' | 'status' | 'tags' | 'claimId'>> & {
      at?: string;
    } = {},
  ) => {
    const at = T(opts.at ?? '2026-02-01');
    nodes[id] = {
      id,
      label,
      summary,
      kind,
      area,
      origin: opts.origin ?? 'user',
      adopted: opts.adopted ?? true,
      since: opts.since ? D(opts.since) : undefined,
      until: opts.until ? D(opts.until) : undefined,
      concern: opts.concern,
      external: opts.external,
      scale: opts.scale,
      level: opts.level,
      status: opts.status,
      claimId: opts.claimId,
      tags: opts.tags ?? [],
      createdAt: at,
      updatedAt: at,
    };
  };

  // Self: the centre.
  el('n_producer', 'role', 'self', 'Creative producer', 'I turn loose ideas into finished, delivered work. The self-description my records confirm most.');
  el(
    'n_director',
    'role',
    'self',
    'Emerging director',
    'I want authorship of original work, not only delivery. Backed by intent more than by shipped work so far.',
  );
  el('n_autonomy', 'value', 'self', 'Autonomy', 'Control over what I work on and when. It decided the Northlight choice.');
  el('n_craft', 'value', 'self', 'Craft', 'Work that holds up to close attention.');
  el('n_depth', 'value', 'self', 'Depth over breadth', 'Fewer things, taken further. Stated often; tested rarely.');
  el('n_recognition', 'value', 'self', 'Recognition for original work', 'To be known for something I authored, not only delivered.');
  el('n_f_service', 'fear', 'self', 'Being seen only as a service provider', 'That the market only sees me as someone who executes other people’s ideas.');
  el('n_optionality', 'belief', 'self', 'Keep options open', 'Keep as many doors open as possible; decide later.');
  el(
    'n_q_optimize',
    'question',
    'self',
    'What kind of work do I actually want to optimise for?',
    'Authorship, craft, income and recognition point in different directions.',
    {
      status: 'exploring',
      at: '2026-05-27',
    },
  );
  // A proposal from the analysis that Noa has not answered yet: not on the map.
  el('n_b_prove', 'belief', 'self', 'I need to prove I can run a studio', 'A studio would make the director identity real.', {
    origin: 'inferred',
    adopted: false,
    at: '2026-07-10',
  });

  // Projects: Noa's own work.
  el('n_goal_ship', 'goal', 'projects', 'Ship Night Ferry', 'Finish and release the animated short by mid-2027.');
  el('n_goal_studio', 'goal', 'projects', 'A small studio', 'Original animated work, with a small team, some day.');
  el(
    'n_f_judged',
    'fear',
    'projects',
    'The simple version isn’t impressive enough',
    'That festivals will find the straightforward cut of Night Ferry forgettable.',
    {
      at: '2026-05-27',
    },
  );
  el(
    'n_q_slip',
    'question',
    'projects',
    'Why does Night Ferry keep slipping?',
    'It was meant to be locked in April. Rather than moving steadily, it stalls for weeks.',
    {
      status: 'exploring',
      at: '2026-05-20',
    },
  );
  el('n_nightferry', 'commitment', 'projects', 'Night Ferry', 'Animated short, about nine minutes. Animatic scenes 1–3 locked.', { since: '2026-02-01' });
  el('n_lowlight', 'commitment', 'projects', 'Lowlight music video', 'Juna’s video: three weeks, full creative control.', {
    since: '2026-03-23',
    until: '2026-04-15',
  });
  el('n_podcast', 'commitment', 'projects', 'Working Titles podcast', 'Co-produced with Marta. Paused in September.', {
    since: '2026-03-02',
    until: '2026-09-15',
  });
  el('n_workshop', 'commitment', 'projects', 'Festival workshop', 'A panel and a two-day workshop, late September. Unpaid.', {
    since: '2026-07-08',
    until: '2026-09-30',
  });
  el('n_scopeadd', 'behaviour', 'projects', 'Adding scope late', 'Rewriting and adding storylines when the work is nearly there.', { tags: ['reads:scope'] });
  el('n_nf_progress', 'state', 'projects', 'Night Ferry progress', 'How far the animatic moves in a week. The outcome I most want explained.', {
    concern: true,
    scale: { min: 0, max: 100, higherIs: 'better' },
  });
  el('n_quality', 'state', 'projects', 'Quality of finished work', 'How well the finished piece holds up.', { scale: { min: 1, max: 5, higherIs: 'better' } });

  // Work: how Noa earns.
  el('n_b_doors', 'belief', 'work', 'Saying no closes doors', 'If I decline an opportunity, it will not come back.', { origin: 'inferred', at: '2026-05-21' });
  el('n_f_missing', 'fear', 'work', 'Missing the one opportunity that matters', 'That the decisive chance arrives and I turn it down.');
  el('n_a_referrals', 'belief', 'work', 'Clients will keep coming via referrals', 'The pipeline continues without active business development.');
  el('n_goal_practice', 'goal', 'work', 'Two-track practice', 'A stable client base that funds one original production at a time.', { at: '2026-09-01' });
  el(
    'n_q_stop',
    'question',
    'work',
    'What if I stopped saying yes on the spot?',
    'Ruth asked what I would cut if I had to drop half. I could not answer quickly.',
    {
      status: 'open',
      at: '2026-07-15',
    },
  );
  el('n_yes', 'behaviour', 'work', 'Saying yes on the spot', 'Accepting an offer during the call, before looking at the week.', { tags: ['reads:accept'] });
  el('n_no', 'behaviour', 'work', 'Declining offers', 'Turning an offer down, or narrowing it.', { tags: ['reads:decline'] });
  el('n_cap', 'behaviour', 'work', 'Commitment cap', 'At most three active commitments; new requests wait for the Sunday review.', { since: '2026-09-15' });
  el('n_freelance', 'role', 'work', 'Freelance producer', 'Brand content, music videos and documentary, almost all by referral.');
  el('n_brightline', 'commitment', 'work', 'Brightline retainer', 'Rebrand retainer. Anchor client #1.', { since: '2026-02-10' });
  el('n_fieldwork', 'commitment', 'work', 'Fieldwork edit', 'Documentary edit: four weeks planned, seven taken.', { since: '2026-05-12', until: '2026-06-30' });
  el('n_grant', 'commitment', 'work', 'Development grant applications', 'Two rounds, March and August.', { since: '2026-03-01', until: '2026-08-05' });
  el('n_load', 'state', 'work', 'Active commitments', 'How many commitments are running at once. Counted from their lifespans, not typed in.', {
    scale: { min: 0, max: 8, higherIs: 'worse' },
    tags: ['commitments-count'],
  });
  el('n_offers', 'state', 'work', 'Incoming offers', 'Enquiries and offers arriving.', { external: true, scale: { min: 0, max: 5, higherIs: 'better' } });
  el('n_network', 'resource', 'work', 'Agency and indie network', 'Most work arrives by referral from two agencies and musicians.');

  // Money.
  el('n_goal_runway', 'goal', 'money', 'Six months of runway', 'Currently about 3.5 months. Target by the end of the year.');
  el('n_f_money', 'fear', 'money', 'Financial instability', 'Runway running out with nothing lined up.');
  el('n_stability', 'value', 'money', 'Stability', 'Enough predictability to plan a year. Matters more to Sam than I usually admit.');
  el('n_barbell', 'belief', 'money', 'Barbell strategy', 'Stable base income on one side, a few high-upside bets on the other.');
  el('n_a_investment', 'belief', 'money', 'A studio needs outside investment', 'Starting a studio is impossible without a co-producer or investor.');
  el('n_runway', 'state', 'money', 'Runway', 'Savings divided by average monthly costs.', { scale: { min: 0, max: 12, higherIs: 'better' } });
  el('n_concentration', 'state', 'money', 'Income concentration', 'Share of income from the two largest clients.', {
    scale: { min: 0, max: 100, higherIs: 'worse' },
  });
  el('n_investment', 'resource', 'money', 'Outside investment', 'A co-producer or investor. None so far.', { external: true });

  // Surroundings: where and when.
  el('n_deepwork', 'behaviour', 'place', 'Morning deep work', '8–11am, one project, phone in another room. Kept about 70% of weekdays.', {
    since: '2026-06-02',
    tags: ['reads:focus'],
  });
  el('n_review', 'behaviour', 'place', 'Sunday weekly review', 'Lapsed in July; restarted in September.');
  el('n_studio', 'place', 'place', 'Home studio', 'Corner of a shared flat. Quiet until about 11am.');
  el('n_afternoons', 'state', 'place', 'Afternoon interruptions', 'Calls after lunch, most days since March.', {
    external: true,
    scale: { min: 0, max: 5, higherIs: 'worse' },
  });

  // People.
  el('n_juna', 'person', 'people', 'Juna', 'Music collaborator. Lowlight video; scoring Night Ferry.');
  el('n_ruth', 'person', 'people', 'Ruth', 'Mentor; former executive producer with a festival network.');
  el('n_sam', 'person', 'people', 'Sam', 'Partner. Wants more predictable evenings and weekends.');
  el('n_marta', 'person', 'people', 'Marta', 'Podcast co-host; generous, persistent.');

  // Health and energy.
  el('n_a_pressure', 'belief', 'health', 'I work better under pressure', 'Deadlines bring out the best work.');
  el('n_sprint', 'behaviour', 'health', 'Late deadline sprints', 'Starting deadline work in the last few days; all-nighters to finish.', {
    tags: ['reads:deadline'],
  });
  el('n_running', 'behaviour', 'health', 'Running three times a week', 'The most reliable habit I have.');
  el('n_energy', 'state', 'health', 'Energy', 'Recorded with each note, 1 (depleted) to 5 (high).', {
    scale: { min: 1, max: 5, higherIs: 'better' },
    tags: ['energy'],
  });
  el('n_fragment', 'state', 'health', 'Fragmented attention', 'Attention split across too many open threads.', {
    scale: { min: 0, max: 5, higherIs: 'worse' },
  });
  el('n_behind', 'state', 'health', 'Feeling behind', 'The sense that the important work is falling behind.', { scale: { min: 0, max: 5, higherIs: 'worse' } });

  // Growth.
  el('n_compounding', 'belief', 'growth', 'Focus compounds', 'Sustained focus on one body of work compounds; scattered effort does not.');
  el('n_sk_production', 'skill', 'growth', 'Production management', 'Scheduling, budgets, crews. Strong and well evidenced.', { level: 'have' });
  el('n_sk_direction', 'skill', 'growth', 'Creative direction', 'Lowlight was the first project with full authorship.', { level: 'developing' });
  el('n_sk_bizdev', 'skill', 'growth', 'Business development', 'Work has always arrived by referral.', { level: 'gap' });
  el('n_sk_3d', 'skill', 'growth', 'Real-time 3D', 'Learning, with Teo. Needed for Night Ferry backgrounds.', { level: 'developing' });

  /* ------------------------------------------------------------ declared links */

  const edges: Record<string, AtlasEdge> = {};
  let edgeN = 0;
  const link = (source: string, type: LinkType, target: string, note?: string) => {
    const id = `edge_${String(++edgeN).padStart(3, '0')}`;
    edges[id] = { id, source, target, type, note, origin: 'user', createdAt: T('2026-02-01') };
  };
  link('n_nightferry', 'aims_at', 'n_goal_ship');
  link('n_brightline', 'aims_at', 'n_goal_runway');
  link('n_fieldwork', 'aims_at', 'n_goal_runway');
  link('n_review', 'aims_at', 'n_goal_practice');
  link('n_autonomy', 'motivates', 'n_freelance');
  link('n_recognition', 'motivates', 'n_goal_ship');
  link('n_barbell', 'motivates', 'n_goal_practice');
  link('n_sam', 'motivates', 'n_stability', 'Sam wants predictable weekends.');
  link('n_ruth', 'motivates', 'n_workshop', 'Ruth thought the panel would be good for me.');
  link('n_craft', 'aligns', 'n_director');
  link('n_compounding', 'aligns', 'n_depth');
  link('n_stability', 'conflicts', 'n_autonomy');
  link('n_depth', 'conflicts', 'n_optionality');
  link('n_workshop', 'conflicts', 'n_nightferry', 'Workshop prep uses the protected Night Ferry days.');
  link('n_brightline', 'conflicts', 'n_nightferry', 'They compete for the same weekdays.');
  link('n_juna', 'part_of', 'n_nightferry');
  link('n_marta', 'part_of', 'n_podcast');
  // A factor of a whole thing is its own element, part of it: the project is not the cause, its progress is.
  link('n_nf_progress', 'part_of', 'n_nightferry');
  link('n_q_slip', 'about', 'n_nf_progress');
  link('n_q_stop', 'about', 'n_yes');
  link('n_q_optimize', 'about', 'n_craft');
  link('n_q_optimize', 'about', 'n_recognition');

  /* ------------------------------------------------------------ records: notes */

  const entries: Record<string, Entry> = {};
  const entry = (
    seq: number,
    date: string,
    kind: Entry['kind'],
    title: string,
    content: string,
    areas: AreaKey[],
    tags: string[],
    nodeIds: string[],
    context?: Entry['context'],
  ) => {
    const id = `ent_${String(seq).padStart(2, '0')}`;
    entries[id] = {
      id,
      seq,
      kind,
      title,
      content,
      date: D(date),
      areas,
      tags,
      nodeIds,
      context,
      createdAt: T(date, '20:00:00'),
      updatedAt: T(date, '20:00:00'),
    };
  };

  entry(
    1,
    '2026-03-02',
    'journal',
    'Said yes to the podcast',
    'Marta asked me to co-produce "Working Titles". I said yes on the call, before checking my calendar. Night Ferry storyboards are half done and Brightline kicks off next week. It felt good to be asked.',
    ['projects', 'people'],
    ['opportunity', 'podcast'],
    ['n_podcast', 'n_marta', 'n_yes'],
    { energy: 4, mood: 1, emotions: ['excited'] },
  );
  entry(
    2,
    '2026-03-09',
    'reflection',
    'Where the week went',
    'Counted it: 11 hours on Brightline, 6 on podcast prep, 2 on Night Ferry. Night Ferry is the thing I say matters most, and it got the least.',
    ['projects'],
    ['time-audit', 'focus'],
    ['n_nightferry', 'n_brightline', 'n_podcast', 'n_load', 'n_nf_progress', 'n_fragment'],
    { energy: 2, mood: -1, emotions: ['scattered'] },
  );
  entry(
    3,
    '2026-03-18',
    'problem',
    'Three deadlines in the same week',
    'Brightline v2, the podcast episode 1 edit and the grant application all land on Friday. I left the grant to the last four days again.',
    ['projects', 'work'],
    ['deadline', 'grant'],
    ['n_brightline', 'n_podcast', 'n_grant', 'n_sprint', 'n_load', 'n_fragment'],
    { energy: 2, mood: -1, emotions: ['anxious'] },
  );
  entry(
    4,
    '2026-03-23',
    'journal',
    'Juna’s music video',
    'Juna offered the "Lowlight" video: tight budget, great song, three weeks. I’m pausing Night Ferry for it. Told myself it’s a portfolio piece.',
    ['projects', 'people', 'work'],
    ['opportunity', 'music-video'],
    ['n_juna', 'n_lowlight', 'n_nightferry', 'n_yes', 'n_network', 'n_energy'],
    { energy: 4, mood: 1, emotions: ['excited'] },
  );
  entry(
    5,
    '2026-04-02',
    'experience',
    'Burnout week',
    'Couldn’t start anything on Monday. Slept ten hours, cancelled two calls. The March sprint on the grant and Brightline caught up with me.',
    ['health'],
    ['recovery', 'energy'],
    ['n_energy', 'n_sprint', 'n_load', 'n_nf_progress', 'n_yes'],
    { energy: 1, mood: -2, emotions: ['tired'] },
  );
  entry(
    6,
    '2026-04-15',
    'experience',
    'Lowlight shipped in three focused weeks',
    'Finished the Lowlight video on time. It was the only project I touched for those three weeks: mornings only, phone in another room. Best thing I’ve made in a year.',
    ['projects', 'place'],
    ['focus', 'finished', 'deep-work'],
    ['n_lowlight', 'n_deepwork', 'n_juna', 'n_sk_direction', 'n_quality', 'n_fragment', 'n_scopeadd', 'n_nf_progress', 'n_sprint'],
    { energy: 4, mood: 2, emotions: ['proud'] },
  );
  entry(
    7,
    '2026-04-19',
    'reflection',
    'Declining Northlight',
    'Turned down the in-house creative lead role. The salary was 40% above my average month. What decided it: I would stop producing my own work for at least two years.',
    ['work', 'self', 'money'],
    ['autonomy', 'decline'],
    ['n_autonomy', 'n_freelance', 'n_no', 'n_offers'],
    { energy: 3, mood: 0, emotions: ['uncertain', 'relieved'] },
  );
  entry(
    8,
    '2026-04-28',
    'observation',
    'Afternoons are gone',
    'Every afternoon this month had at least two calls. Nothing creative has happened after 2pm since March.',
    ['place'],
    ['calls', 'schedule'],
    ['n_afternoons', 'n_fragment'],
  );
  entry(
    9,
    '2026-05-06',
    'journal',
    'Rate conversation with Brightline',
    'Asked Brightline for a scope change fee after the third round of revisions. They agreed without pushback. I had been dreading it for two weeks for nothing.',
    ['money', 'work'],
    ['pricing', 'clients'],
    ['n_brightline'],
    { energy: 3, mood: 1, emotions: ['relieved'] },
  );
  entry(
    10,
    '2026-05-12',
    'journal',
    'Fieldwork edit',
    'Said yes to a four-week documentary edit for Fieldwork. Short-term money, and they’re well connected. That’s five active things now.',
    ['projects', 'money', 'work'],
    ['opportunity', 'income'],
    ['n_fieldwork', 'n_yes', 'n_load', 'n_runway', 'n_f_money', 'n_offers', 'n_no', 'n_behind', 'n_network', 'n_concentration'],
    { energy: 3, mood: 0 },
  );
  entry(
    11,
    '2026-05-20',
    'problem',
    'Night Ferry keeps slipping',
    'The animatic was supposed to be locked in April. It’s late May and I’ve done maybe 30% of it. Every week something paid jumps ahead.',
    ['projects'],
    ['night-ferry', 'slipping'],
    ['n_nightferry', 'n_nf_progress', 'n_goal_ship', 'n_load', 'n_fragment', 'n_behind'],
    { energy: 2, mood: -1, emotions: ['frustrated'] },
  );
  entry(
    12,
    '2026-05-27',
    'reflection',
    'Why I add scope',
    'Rewrote the Night Ferry treatment again and added a second storyline. Honest reason: I’m scared the simple version isn’t impressive enough for festivals.',
    ['projects', 'self'],
    ['scope', 'festival'],
    ['n_nightferry', 'n_scopeadd', 'n_f_judged', 'n_nf_progress', 'n_recognition'],
    { energy: 3, mood: -1, emotions: ['uncertain'] },
  );
  entry(
    13,
    '2026-06-02',
    'observation',
    'Deep-work experiment: day 1',
    'Starting two weeks of protected 8–11am blocks. No calls, no email. One project per block.',
    ['place'],
    ['deep-work', 'experiment'],
    ['n_deepwork'],
  );
  entry(
    14,
    '2026-06-16',
    'reflection',
    'Deep-work experiment: results',
    'Kept 10 of 10 mornings. Finished animatic act one and the Fieldwork rough cut. Stress lower. Afternoons still chaotic.',
    ['place', 'projects'],
    ['deep-work', 'finished'],
    ['n_deepwork', 'n_nf_progress', 'n_afternoons', 'n_fragment', 'n_quality', 'n_sprint'],
    { energy: 4, mood: 1, emotions: ['focused'] },
  );
  entry(
    15,
    '2026-06-24',
    'journal',
    'Podcast stalled',
    'Two episodes recorded in four months. Marta wants to keep going; I haven’t opened the project in three weeks and I don’t know how to say I’m out.',
    ['projects', 'people'],
    ['podcast', 'avoidance'],
    ['n_podcast', 'n_marta'],
    { energy: 2, mood: -1, emotions: ['anxious'] },
  );
  entry(
    16,
    '2026-07-03',
    'experience',
    'Festival rejection: Tidewater',
    'My old short "Tidewater" was rejected again. Feedback: "strong craft, unclear intention". It stung more than I expected.',
    ['work', 'self'],
    ['festival', 'feedback'],
    ['n_recognition', 'n_f_judged'],
    { energy: 2, mood: -2, emotions: ['frustrated'] },
  );
  entry(
    17,
    '2026-07-08',
    'journal',
    'Panel and workshop: yes',
    'Agreed to speak on a festival panel and run a two-day workshop in late September. Visibility, and Ruth thinks it would be good for me. It’s unpaid.',
    ['work', 'people', 'projects'],
    ['opportunity', 'visibility'],
    ['n_workshop', 'n_ruth', 'n_yes', 'n_load'],
    { energy: 3, mood: 1 },
  );
  entry(
    18,
    '2026-07-15',
    'reflection',
    'Mentor call with Ruth',
    'Ruth asked what I would stop doing if I had to cut half my projects. I couldn’t answer quickly. She said that was the answer.',
    ['people', 'self'],
    ['mentor', 'focus'],
    ['n_ruth', 'n_q_stop'],
    { energy: 3, mood: 0, emotions: ['uncertain'] },
  );
  entry(
    19,
    '2026-07-22',
    'habit',
    'Weekly review lapsed',
    'No Sunday review since early July. Without it I say yes to things without seeing the whole week.',
    ['place'],
    ['weekly-review'],
    ['n_review', 'n_yes'],
    { energy: 2, mood: -1 },
  );
  entry(
    20,
    '2026-07-29',
    'problem',
    'Runway check',
    'Ran the numbers: 3.5 months of runway. 72% of income comes from Brightline and Fieldwork. If one leaves, I’m at six weeks.',
    ['money'],
    ['runway', 'concentration'],
    ['n_runway', 'n_concentration', 'n_f_money', 'n_a_referrals', 'n_brightline'],
    { energy: 2, mood: -1, emotions: ['anxious'] },
  );
  entry(
    21,
    '2026-08-05',
    'journal',
    'Grant deadline sprint, again',
    'Two all-nighters for the development grant. Submitted 40 minutes before it closed. Same shape as March.',
    ['projects', 'health'],
    ['grant', 'deadline'],
    ['n_sprint', 'n_a_pressure', 'n_grant'],
    { energy: 2, mood: -1, emotions: ['tired'] },
  );
  entry(
    22,
    '2026-08-09',
    'experience',
    'Crash after the grant',
    'Three flat days after the grant. Admin only. Cancelled the Thursday Night Ferry session.',
    ['health'],
    ['recovery'],
    ['n_energy', 'n_sprint', 'n_nf_progress'],
    { energy: 1, mood: -1, emotions: ['tired'] },
  );
  entry(
    23,
    '2026-08-14',
    'observation',
    'Exploration is not the same as overcommitment',
    'Looking back, the podcast and the panel were deliberately exploratory: I wanted to find out whether I like being on the talking side of the work. That is different from overcommitting by accident.',
    ['projects', 'self'],
    ['exploration'],
    ['n_podcast', 'n_workshop', 'n_yes'],
  );
  entry(
    24,
    '2026-08-19',
    'journal',
    'New day rate',
    'Raised my day rate by 15% for new clients. Two enquiries since; one accepted without question.',
    ['money'],
    ['pricing'],
    ['n_runway', 'n_offers', 'n_no', 'n_network'],
    { energy: 3, mood: 1 },
  );
  entry(
    25,
    '2026-08-27',
    'reflection',
    'What Hybrid would actually look like',
    'Two anchor clients, three days a week. Night Ferry gets Tuesday and Thursday, protected. Everything else waits for the quarterly review. Sam would get predictable weekends.',
    ['work', 'projects'],
    ['strategy', 'hybrid'],
    ['n_goal_practice', 'n_barbell', 'n_sam'],
    { energy: 4, mood: 1, emotions: ['calm'] },
  );
  entry(
    26,
    '2026-09-01',
    'goal',
    'Hybrid Quarter',
    'Committing to a 90-day test of the hybrid structure. Success means: animatic locked, runway at four months or more, and no new commitments without the Sunday review.',
    ['work'],
    ['hybrid', 'experiment'],
    ['n_goal_practice'],
    { energy: 4, mood: 1, emotions: ['focused'] },
  );
  entry(
    27,
    '2026-09-08',
    'project',
    'Night Ferry animatic: scenes 1–3',
    'Scenes 1–3 locked using the Tuesday and Thursday blocks, steady rather than rushed. Scene 4 needs a new layout pass.',
    ['projects'],
    ['night-ferry'],
    ['n_nightferry', 'n_nf_progress', 'n_deepwork', 'n_load', 'n_sprint', 'n_energy'],
    { energy: 4, mood: 1, emotions: ['focused'] },
  );
  entry(
    28,
    '2026-09-12',
    'journal',
    'Declined a pitch video',
    'A friend’s startup wanted a pitch video in two weeks. First time this year I said no without agonising: the commitment cap made it easy.',
    ['projects', 'self'],
    ['decline', 'commitment-cap'],
    ['n_no', 'n_cap', 'n_yes', 'n_load'],
    { energy: 3, mood: 1, emotions: ['calm'] },
  );
  entry(
    29,
    '2026-09-18',
    'journal',
    'Commitment cap: first week',
    'Down to three active things: Brightline, Night Ferry and workshop prep. Fieldwork wrapped; the podcast is paused and Marta took it well. Focus hours are up, though I keep reaching for my inbox.',
    ['projects', 'place'],
    ['commitment-cap'],
    ['n_podcast', 'n_marta', 'n_load', 'n_fragment', 'n_cap', 'n_energy'],
    { energy: 4, mood: 1, emotions: ['relieved'] },
  );
  entry(
    30,
    '2026-09-24',
    'reflection',
    'Workshop prep is eating the blocks',
    'Workshop prep took both Night Ferry days this week. The yes from July is collecting its bill.',
    ['projects'],
    ['workshop'],
    ['n_workshop', 'n_nightferry', 'n_nf_progress', 'n_load'],
    { energy: 2, mood: -1, emotions: ['frustrated'] },
  );

  /* ------------------------------------------------------------ records: decisions (branch points) */

  const decisions: Record<string, Decision> = {};
  const decision = (seq: number, date: string, d: Omit<Decision, 'id' | 'seq' | 'date' | 'createdAt' | 'updatedAt'>) => {
    const id = `dec_${String(seq).padStart(2, '0')}`;
    decisions[id] = { ...d, id, seq, date: D(date), createdAt: T(date, '18:00:00'), updatedAt: T(date, '18:00:00') };
  };
  const opt = (id: string, label: string, rationale: string, expected?: string, imagined?: string) => ({ id, label, rationale, expected, imagined });

  decision(1, '2026-02-10', {
    title: 'Accept the Brightline rebrand retainer',
    context: 'Brightline offered a six-month retainer for their rebrand just as Night Ferry pre-production was starting.',
    options: [
      opt('o1', 'Accept the full retainer', 'Six months of steady income from a client I like.', 'About two days a week, steady income.'),
      opt(
        'o2',
        'Accept at reduced scope',
        'Protect two days a week for Night Ferry.',
        'Less income; Night Ferry storyboards done by April.',
        'Probably Night Ferry storyboards by April, and a thinner spring.',
      ),
      opt('o3', 'Decline', 'Keep Night Ferry on schedule.', 'Night Ferry on schedule; money tight by summer.'),
    ],
    chosenOptionId: 'o1',
    chosenAction: 'Accepted the full retainer.',
    expectedOutcome: 'Stable income for about two days a week.',
    enacted: 'yes',
    actualOutcome: 'Averaged 3.5 days a week, with three extra revision rounds.',
    outcomeRating: 'worse',
    processNote: 'Reasonable with what I knew. What I didn’t do: ask for a revision cap.',
    learned: 'Retainers need a revision cap written into the scope.',
    nextTime: 'If a retainer is offered, then I write the revision cap into the scope before saying yes.',
    optimizingFor: ['Income', 'Security'],
    claimIds: ['c01'],
    areas: ['work', 'money', 'projects'],
    tags: ['client'],
    nodeIds: ['n_brightline', 'n_load', 'n_f_money'],
    reviewedAt: T('2026-05-06'),
  });
  decision(2, '2026-03-02', {
    title: 'Co-produce the Working Titles podcast',
    context: 'Marta asked on a call whether I would co-produce her interview podcast.',
    options: [
      opt('o1', 'Say yes', 'Visibility, and working with Marta is fun.', 'A light side project, about three hours a week.'),
      opt('o2', 'Advise only', 'Stay involved at a lower cost.', 'An hour a week; less visibility.'),
      opt('o3', 'Decline', 'No capacity until Night Ferry’s animatic is locked.', 'Nothing added; a slightly awkward call.'),
    ],
    chosenOptionId: 'o1',
    chosenAction: 'Said yes on the call.',
    expectedOutcome: 'A light side project, about three hours a week.',
    enacted: 'partly',
    actualOutcome: 'Two episodes in four months; it became a weight I avoided.',
    outcomeRating: 'worse',
    processNote: 'I decided on the call, without looking at the week. That was the mistake, not the podcast.',
    learned: 'I say yes on calls before checking capacity.',
    nextTime: 'If someone asks on a call, then I say I will answer after the Sunday review.',
    optimizingFor: ['Opportunity', 'Visibility', 'Relationships'],
    claimIds: ['c02', 'c07'],
    areas: ['projects', 'people'],
    tags: ['opportunity'],
    nodeIds: ['n_podcast', 'n_marta', 'n_yes'],
    reviewedAt: T('2026-06-24'),
  });
  decision(3, '2026-03-23', {
    title: 'Pause Night Ferry for the Lowlight music video',
    context: 'Juna offered a three-week music video with a tight budget and a great song.',
    options: [
      opt('o1', 'Take it and pause Night Ferry', 'Portfolio piece with full creative control.', 'A three-week detour, back on Night Ferry by mid-April.'),
      opt(
        'o2',
        'Take it and run both',
        'Keep momentum on Night Ferry.',
        'Both moving, slowly.',
        'Probably neither finished well: the Lowlight weeks worked because nothing else ran.',
      ),
      opt('o3', 'Decline', 'Night Ferry is the priority.', 'Night Ferry storyboards finished in April.'),
    ],
    chosenOptionId: 'o1',
    chosenAction: 'Took the video and paused Night Ferry.',
    expectedOutcome: 'A three-week detour, back on Night Ferry by mid-April.',
    enacted: 'yes',
    actualOutcome: 'The video shipped on time and was strong; Night Ferry lost six weeks, not three.',
    outcomeRating: 'mixed',
    processNote: 'A good choice for the work itself. I underestimated the restart cost.',
    learned: 'Restarting a paused project costs more than the pause itself.',
    optimizingFor: ['Opportunity', 'Visibility', 'Craft'],
    claimIds: ['c01', 'c13'],
    areas: ['projects', 'work', 'people'],
    tags: ['opportunity', 'music-video'],
    nodeIds: ['n_juna', 'n_nightferry', 'n_lowlight', 'n_yes'],
    reviewedAt: T('2026-05-20'),
  });
  decision(4, '2026-04-18', {
    title: 'Decline the Northlight creative lead role',
    context: 'Northlight offered an in-house creative lead position at 40% above my average monthly income.',
    options: [
      opt('o1', 'Accept', 'Financial stability and a team to lead.', 'Stable income, no own work for two years.'),
      opt('o2', 'Negotiate a three-day contract', 'Keep some time for my own work.', 'Some stability, some own work, a lot of negotiating.'),
      opt('o3', 'Decline', 'Keep time for original work; accept income volatility.', 'More time for original work, with less predictable income.'),
    ],
    chosenOptionId: 'o3',
    chosenAction: 'Declined, with a note to stay in touch.',
    expectedOutcome: 'More time for original work, with less predictable income.',
    enacted: 'yes',
    actualOutcome: 'No regret so far; the time went into Lowlight and Night Ferry. Offers kept arriving.',
    outcomeRating: 'as_expected',
    processNote: 'A clear reason made it easy: it would have stopped my own work for two years.',
    learned: 'A clear reason makes the no easy.',
    optimizingFor: ['Autonomy', 'Long-term growth', 'Craft'],
    claimIds: [],
    areas: ['work', 'self', 'money'],
    tags: ['decline'],
    nodeIds: ['n_autonomy', 'n_freelance', 'n_no', 'n_offers'],
    reviewedAt: T('2026-07-15'),
  });
  decision(5, '2026-05-12', {
    title: 'Take the Fieldwork documentary edit',
    context: 'Fieldwork needed an editor for four weeks. Well connected, good rate.',
    options: [
      opt('o1', 'Accept four weeks', 'Money now and a useful network.', 'Four weeks, good money, useful contacts.'),
      opt('o2', 'Consult one day a week', 'Keep the relationship at a lower cost.', 'Less money; Night Ferry keeps its days.'),
      opt('o3', 'Decline', 'Already running four things.', 'Nothing added.'),
    ],
    chosenOptionId: 'o1',
    chosenAction: 'Accepted the four-week edit.',
    expectedOutcome: 'Four weeks, good money, useful contacts.',
    enacted: 'yes',
    actualOutcome: 'Stretched to seven weeks alongside Brightline.',
    outcomeRating: 'worse',
    processNote: 'I estimated it against an empty calendar, not the real one.',
    learned: 'My estimates ignore what is already on the plate.',
    nextTime: 'If I estimate a new commitment, then I estimate it against this week’s real load.',
    optimizingFor: ['Income', 'Opportunity', 'Relationships'],
    claimIds: ['c01', 'c16'],
    areas: ['projects', 'money', 'work'],
    tags: ['opportunity', 'income'],
    nodeIds: ['n_fieldwork', 'n_yes', 'n_load', 'n_f_money'],
    reviewedAt: T('2026-07-01'),
  });
  decision(6, '2026-07-08', {
    title: 'Speak on the festival panel and run the workshop',
    context: 'A festival invited me to a panel and to run a two-day workshop in late September. Unpaid.',
    options: [
      opt('o1', 'Yes to both', 'Visibility with programmers; Ruth recommended it.', 'Visibility and new contacts for about four days of prep.'),
      opt(
        'o2',
        'Panel only',
        'Visibility at a fraction of the prep.',
        'Most of the visibility for a day of prep.',
        'Probably most of the visibility, and the September Night Ferry days intact.',
      ),
      opt('o3', 'Decline both', 'Protect September for Night Ferry.', 'September protected; less visibility.'),
    ],
    chosenOptionId: 'o1',
    chosenAction: 'Said yes to both.',
    expectedOutcome: 'Visibility and new contacts for about four days of prep.',
    enacted: 'yes',
    actualOutcome: 'Prep is already at six days and is using the Night Ferry blocks.',
    outcomeRating: 'worse',
    optimizingFor: ['Visibility', 'Opportunity', 'Relationships'],
    claimIds: ['c01', 'c07'],
    areas: ['work', 'projects', 'people'],
    tags: ['opportunity', 'visibility'],
    nodeIds: ['n_workshop', 'n_ruth', 'n_yes', 'n_load'],
    reviewedAt: T('2026-09-24'),
  });
  decision(7, '2026-08-19', {
    title: 'Raise the day rate by 15% for new clients',
    context: 'Runway is short and income is concentrated. Existing clients stay on current rates.',
    options: [
      opt('o1', 'Raise by 15%', 'Test the market without scaring anyone off.', 'Fewer but better-paid projects.'),
      opt('o2', 'Raise by 25%', 'Closer to comparable producers.', 'Some enquiries lost; more income per project.'),
      opt('o3', 'Keep the rate', 'Avoid losing enquiries while runway is short.', 'The same work at the same pay.'),
    ],
    chosenOptionId: 'o1',
    chosenAction: 'Raised the rate by 15% for new enquiries.',
    expectedOutcome: 'Fewer but better-paid projects.',
    enacted: 'yes',
    actualOutcome: 'One of two enquiries accepted without pushback.',
    outcomeRating: 'as_expected',
    optimizingFor: ['Income', 'Long-term growth'],
    claimIds: [],
    areas: ['money'],
    tags: ['pricing'],
    nodeIds: ['n_runway', 'n_offers'],
    reviewedAt: T('2026-09-12'),
  });
  decision(8, '2026-09-01', {
    title: 'Commit to the Hybrid Strategy as a 90-day test',
    context: 'Compared the three paths after the runway check. Path A needs more runway than I have; Path B pauses original work.',
    options: [
      opt('o1', 'Path A: studio full-time', 'Fastest route to authorship, but 3.5 months of runway is not enough.', 'Authorship fast; runway gone by winter.'),
      opt(
        'o2',
        'Path B: apply for senior roles',
        'Stability and learning at scale; original work pauses.',
        'Stable income within three months; Night Ferry paused.',
      ),
      opt(
        'o3',
        'Path C: hybrid for 90 days',
        'Tests whether client work can fund protected production time.',
        'Animatic locked, runway at four months or more.',
      ),
    ],
    chosenOptionId: 'o3',
    chosenAction: 'Started the Hybrid Quarter: two anchor clients, Tuesday and Thursday for Night Ferry.',
    expectedOutcome: 'Animatic locked, runway at four months or more, fewer commitments.',
    enacted: 'yes',
    optimizingFor: ['Focus', 'Long-term growth', 'Security'],
    claimIds: ['c20', 'c13'],
    areas: ['work', 'projects'],
    tags: ['strategy', 'hybrid'],
    nodeIds: ['n_goal_practice', 'n_barbell'],
  });

  /* ------------------------------------------------------------ history: what the notes report */

  const occurrences: Record<string, Occurrence> = {};
  const E = (n: number): SourceRef => ({ kind: 'entry', id: `ent_${String(n).padStart(2, '0')}` });
  const Dc = (n: number): SourceRef => ({ kind: 'decision', id: `dec_${String(n).padStart(2, '0')}` });
  const X = (n: number): SourceRef => ({ kind: 'experiment', id: `exp_${String(n).padStart(2, '0')}` });
  const occ = (
    id: string,
    kind: OccurrenceKind,
    date: string,
    label: string,
    source: SourceRef,
    excerpt: string,
    about: string[],
    opts: Partial<Pick<Occurrence, 'instanceOf' | 'value' | 'external' | 'landmark' | 'approx' | 'changes'>> & { until?: string } = {},
  ) => {
    occurrences[id] = {
      id,
      kind,
      label,
      date: D(date),
      until: opts.until ? D(opts.until) : undefined,
      approx: opts.approx,
      about,
      instanceOf: opts.instanceOf,
      value: opts.value,
      external: opts.external,
      landmark: opts.landmark,
      source,
      excerpt,
      changes: opts.changes,
      mode: 'actual',
      origin: 'user',
      createdAt: T(date, '20:05:00'),
    };
  };

  occ(
    'o01',
    'action',
    '2026-03-02',
    'Said yes to co-producing the podcast',
    E(1),
    'I said yes on the call, before checking my calendar.',
    ['n_podcast', 'n_marta'],
    {
      instanceOf: 'n_yes',
    },
  );
  occ(
    'o02',
    'event',
    '2026-03-09',
    'Night Ferry got 2 of 19 hours',
    E(2),
    'Counted it: 11 hours on Brightline, 6 on podcast prep, 2 on Night Ferry.',
    ['n_nightferry', 'n_nf_progress', 'n_load'],
    {
      changes: [
        { factor: 'n_nf_progress', reads: 'low' },
        { factor: 'n_fragment', reads: 'high' },
        { factor: 'n_behind', reads: 'high' },
      ],
    },
  );
  occ(
    'o03',
    'event',
    '2026-03-18',
    'Three deadlines in the same week',
    E(3),
    'Brightline v2, the podcast episode 1 edit and the grant application all land on Friday.',
    ['n_brightline', 'n_podcast', 'n_grant'],
    { changes: [{ factor: 'n_fragment', reads: 'high' }] },
  );
  occ('o04', 'action', '2026-03-16', 'Grant sprint in the last four days', E(3), 'I left the grant to the last four days again.', ['n_grant'], {
    instanceOf: 'n_sprint',
    until: '2026-03-20',
  });
  occ('o05', 'action', '2026-03-23', 'Took the Lowlight video, paused Night Ferry', E(4), 'I’m pausing Night Ferry for it.', ['n_lowlight', 'n_nightferry'], {
    instanceOf: 'n_yes',
    changes: [{ factor: 'n_nf_progress', reads: 'down' }],
  });
  occ('o06', 'experience', '2026-03-30', 'Burnout week', E(5), 'Couldn’t start anything on Monday. Slept ten hours, cancelled two calls.', ['n_energy'], {
    landmark: true,
    until: '2026-04-03',
    approx: true,
    changes: [{ factor: 'n_energy', reads: 'low' }],
  });
  occ(
    'o07',
    'event',
    '2026-04-15',
    'Lowlight shipped in three focused weeks',
    E(6),
    'Finished the Lowlight video on time. It was the only project I touched for those three weeks.',
    ['n_lowlight', 'n_quality'],
    {
      landmark: true,
      changes: [
        { factor: 'n_quality', reads: 'high' },
        { factor: 'n_fragment', reads: 'low' },
      ],
    },
  );
  occ('o08', 'action', '2026-04-18', 'Declined the Northlight role', E(7), 'Turned down the in-house creative lead role.', ['n_offers', 'n_freelance'], {
    instanceOf: 'n_no',
  });
  occ('o09', 'event', '2026-04-01', 'Two calls or more every afternoon', E(8), 'Every afternoon this month had at least two calls.', ['n_afternoons'], {
    external: true,
    until: '2026-04-28',
    approx: true,
    changes: [{ factor: 'n_afternoons', reads: 'high' }],
  });
  occ('o10', 'action', '2026-05-06', 'Asked Brightline for a scope-change fee', E(9), 'They agreed without pushback.', ['n_brightline']);
  occ('o11', 'action', '2026-05-12', 'Said yes to the Fieldwork edit: five active things', E(10), 'That’s five active things now.', ['n_fieldwork', 'n_load'], {
    instanceOf: 'n_yes',
  });
  occ(
    'o12',
    'event',
    '2026-05-20',
    'Night Ferry at 30% (planned: locked in April)',
    E(11),
    'It’s late May and I’ve done maybe 30% of it.',
    ['n_nf_progress', 'n_nightferry'],
    {
      value: 30,
      changes: [
        { factor: 'n_nf_progress', reads: 'low' },
        { factor: 'n_behind', reads: 'high' },
      ],
    },
  );
  occ(
    'o13',
    'action',
    '2026-05-27',
    'Added a second storyline to Night Ferry',
    E(12),
    'Rewrote the Night Ferry treatment again and added a second storyline.',
    ['n_nightferry'],
    {
      instanceOf: 'n_scopeadd',
    },
  );
  occ('o14', 'action', '2026-06-02', 'Two weeks of protected mornings', E(14), 'Kept 10 of 10 mornings.', ['n_nf_progress'], {
    instanceOf: 'n_deepwork',
    until: '2026-06-16',
  });
  occ(
    'o15',
    'event',
    '2026-06-16',
    'Animatic act one finished',
    E(14),
    'Finished animatic act one and the Fieldwork rough cut.',
    ['n_nf_progress', 'n_nightferry'],
    {
      changes: [
        { factor: 'n_nf_progress', reads: 'up' },
        { factor: 'n_afternoons', reads: 'high' },
      ],
    },
  );
  occ('o16', 'event', '2026-06-24', 'Podcast stalled for three weeks', E(15), 'I haven’t opened the project in three weeks.', ['n_podcast']);
  occ(
    'o17',
    'experience',
    '2026-07-03',
    'Tidewater rejected: “strong craft, unclear intention”',
    E(16),
    'It stung more than I expected.',
    ['n_f_judged', 'n_recognition'],
    {
      external: true,
      landmark: true,
      changes: [{ factor: 'n_f_judged', reads: 'up' }],
    },
  );
  occ(
    'o18',
    'action',
    '2026-07-08',
    'Said yes to the panel and the workshop',
    E(17),
    'Agreed to speak on a festival panel and run a two-day workshop.',
    ['n_workshop', 'n_ruth'],
    {
      instanceOf: 'n_yes',
    },
  );
  occ('o19', 'experience', '2026-07-15', 'Could not say what I would cut', E(18), 'I couldn’t answer quickly. She said that was the answer.', [
    'n_q_stop',
    'n_ruth',
  ]);
  occ('o20', 'event', '2026-07-05', 'Weekly review lapsed', E(19), 'No Sunday review since early July.', ['n_review'], {
    approx: true,
    changes: [{ factor: 'n_review', reads: 'absent' }],
  });
  occ('o21', 'reading', '2026-07-29', 'Runway 3.5 months', E(20), 'Ran the numbers: 3.5 months of runway.', ['n_runway'], {
    instanceOf: 'n_runway',
    value: 3.5,
  });
  occ('o22', 'reading', '2026-07-29', '72% of income from two clients', E(20), '72% of income comes from Brightline and Fieldwork.', ['n_concentration'], {
    instanceOf: 'n_concentration',
    value: 72,
  });
  occ('o23', 'action', '2026-08-03', 'Grant sprint: two all-nighters', E(21), 'Two all-nighters for the development grant.', ['n_grant'], {
    instanceOf: 'n_sprint',
    until: '2026-08-05',
  });
  occ('o24', 'experience', '2026-08-06', 'Three flat days after the grant', E(22), 'Three flat days after the grant. Admin only.', ['n_energy'], {
    until: '2026-08-09',
    changes: [{ factor: 'n_energy', reads: 'low' }],
  });
  occ('o25', 'action', '2026-08-19', 'Raised the day rate by 15%', E(24), 'Raised my day rate by 15% for new clients.', ['n_runway']);
  occ('o26', 'event', '2026-08-26', 'Two enquiries arrived', E(24), 'Two enquiries since; one accepted without question.', ['n_offers'], {
    external: true,
    approx: true,
    changes: [{ factor: 'n_offers', reads: 'up' }],
  });
  occ(
    'o27',
    'event',
    '2026-09-08',
    'Night Ferry scenes 1–3 locked',
    E(27),
    'Scenes 1–3 locked using the Tuesday and Thursday blocks, steady rather than rushed.',
    ['n_nf_progress', 'n_nightferry'],
    { changes: [{ factor: 'n_nf_progress', reads: 'up' }] },
  );
  occ('o28', 'action', '2026-09-12', 'Declined a startup pitch video', E(28), 'I said no without agonising: the commitment cap made it easy.', ['n_cap'], {
    instanceOf: 'n_no',
    changes: [{ factor: 'n_yes', reads: 'absent' }],
  });
  occ(
    'o29',
    'action',
    '2026-09-15',
    'Commitment cap began: three active things',
    E(29),
    'Down to three active things: Brightline, Night Ferry and workshop prep.',
    ['n_load'],
    {
      instanceOf: 'n_cap',
      changes: [{ factor: 'n_fragment', reads: 'down' }],
    },
  );
  occ(
    'o30',
    'event',
    '2026-09-22',
    'Workshop prep took both Night Ferry days',
    E(30),
    'Workshop prep took both Night Ferry days this week.',
    ['n_workshop', 'n_nf_progress'],
    { changes: [{ factor: 'n_nf_progress', reads: 'down' }] },
  );

  /* ------------------------------------------------------------ understanding: claims */

  const claims: Record<string, Claim> = {};
  const ev = (
    id: string,
    source: SourceRef,
    stance: Evidence['stance'],
    kind: EvidenceKind,
    excerpt: string,
    addedAt: string,
    addedBy: Evidence['addedBy'] = 'user',
  ): Evidence => ({
    id,
    source,
    stance,
    kind,
    excerpt,
    addedBy,
    addedAt: T(addedAt),
  });
  const claim = (
    id: string,
    code: number,
    from: string,
    effect: Effect,
    to: string,
    opts: Partial<Pick<Claim, 'via' | 'when' | 'lag' | 'author' | 'state' | 'rivalIds' | 'with' | 'view' | 'aspect'>> & {
      evidence?: Evidence[];
      at?: string;
    } = {},
  ) => {
    const at = T(opts.at ?? '2026-05-21');
    claims[id] = {
      id,
      code,
      from,
      with: opts.with ?? [],
      to,
      aspect: opts.aspect,
      effect,
      via: opts.via,
      when: opts.when,
      lag: opts.lag,
      author: opts.author ?? 'user',
      state: opts.state ?? 'adopted',
      view: opts.view,
      evidence: opts.evidence ?? [],
      rivalIds: opts.rivalIds ?? [],
      createdAt: at,
      updatedAt: at,
    };
  };

  claim('c01', 1, 'n_load', 'lowers', 'n_nf_progress', {
    via: 'Paid work takes the days Night Ferry needed; each new commitment moves it down the queue.',
    lag: '1–3 weeks',
    rivalIds: ['c11'],
    view: { stance: 'agree', at: T('2026-09-08') },
    evidence: [
      ev('e0101', E(2), 'supports', 'instance', '11 hours on Brightline, 6 on podcast prep, 2 on Night Ferry.', '2026-05-21'),
      ev('e0102', Dc(3), 'supports', 'instance', 'Night Ferry lost six weeks, not three.', '2026-05-21'),
      ev('e0103', E(11), 'supports', 'instance', 'Every week something paid jumps ahead.', '2026-05-21'),
      ev('e0104', E(27), 'supports', 'contrast', 'Down to three commitments: scenes 1–3 locked, steady rather than rushed.', '2026-09-08'),
      ev('e0105', E(30), 'supports', 'instance', 'Workshop prep took both Night Ferry days this week.', '2026-09-25'),
      // The "how" (paid work takes the Night Ferry days) seen happening, not only described.
      ev('e0106', E(30), 'supports', 'mechanism', 'Workshop prep took both Night Ferry days this week.', '2026-09-25'),
    ],
  });
  claim('c02', 2, 'n_yes', 'raises', 'n_load', {
    via: 'Each yes adds a commitment before the week has been looked at.',
    when: 'a yes on the spot, before looking at the week',
    evidence: [
      ev('e0201', E(1), 'supports', 'instance', 'I said yes on the call, before checking my calendar.', '2026-05-21'),
      ev('e0202', E(10), 'supports', 'instance', 'That’s five active things now.', '2026-05-21'),
      ev('e0203', E(17), 'supports', 'instance', 'Agreed to speak on a festival panel and run a two-day workshop.', '2026-07-09'),
      ev('e0204', E(28), 'supports', 'contrast', 'I said no without agonising; nothing was added.', '2026-09-12'),
      ev('e0205', E(1), 'supports', 'mechanism', 'I said yes on the call, before checking my calendar.', '2026-05-21'),
    ],
  });
  claim('c03', 3, 'n_load', 'raises', 'n_fragment', {
    via: 'More open threads mean more switching between them.',
    evidence: [
      ev('e0301', E(2), 'supports', 'instance', 'Night Ferry is the thing I say matters most, and it got the least.', '2026-05-21'),
      ev('e0302', E(3), 'supports', 'instance', 'Brightline v2, the podcast episode 1 edit and the grant application all land on Friday.', '2026-05-21'),
      ev('e0303', E(29), 'supports', 'contrast', 'Down to three active things. Focus hours are up.', '2026-09-18'),
    ],
  });
  claim('c04', 4, 'n_fragment', 'lowers', 'n_nf_progress', {
    via: 'Night Ferry needs long, unbroken stretches.',
    evidence: [
      ev('e0401', E(11), 'supports', 'instance', 'Every week something paid jumps ahead.', '2026-05-21'),
      ev('e0402', E(6), 'supports', 'contrast', 'It was the only project I touched for those three weeks.', '2026-05-21'),
      ev('e0403', E(14), 'supports', 'contrast', 'Kept 10 of 10 mornings. Finished animatic act one.', '2026-06-16'),
    ],
  });
  claim('c05', 5, 'n_nf_progress', 'lowers', 'n_behind', {
    via: 'Watching the most important project stall feels like falling behind.',
    evidence: [
      ev('e0501', E(2), 'supports', 'instance', 'It got the least.', '2026-05-21'),
      ev('e0502', E(11), 'supports', 'instance', 'It’s late May and I’ve done maybe 30% of it.', '2026-05-21'),
    ],
  });
  claim('c06', 6, 'n_behind', 'raises', 'n_yes', {
    via: 'Saying yes feels like catching up: money or visibility now.',
    at: '2026-08-14',
    evidence: [
      ev('e0601', E(10), 'supports', 'instance', 'Short-term money, and they’re well connected.', '2026-08-14'),
      {
        ...ev('e0602', E(17), 'supports', 'instance', 'Agreed to speak on a festival panel and run a two-day workshop.', '2026-08-14'),
        cause: E(16),
      },
    ],
  });
  claim('c07', 7, 'n_b_doors', 'raises', 'n_yes', {
    aspect: { from: 'when it is held' },
    via: 'If declining feels like losing the chance for good, yes is the safe answer.',
    evidence: [
      ev('e0701', E(1), 'supports', 'instance', 'It felt good to be asked.', '2026-05-21'),
      ev('e0702', E(17), 'supports', 'instance', 'Visibility, and Ruth thinks it would be good for me.', '2026-07-09'),
    ],
  });
  claim('c08', 8, 'n_no', 'lowers', 'n_offers', {
    via: 'Turning something down means it will not come back.',
    evidence: [
      ev('e0801', E(10), 'counters', 'counter_case', 'Weeks after declining Northlight: an offer from Fieldwork.', '2026-05-12'),
      ev('e0802', E(24), 'counters', 'counter_case', 'Two enquiries since; one accepted without question.', '2026-08-19'),
    ],
  });
  claim('c09', 9, 'n_sprint', 'lowers', 'n_energy', {
    via: 'All-nighters are paid back in flat days.',
    lag: '1–4 days',
    evidence: [
      ev('e0901', E(5), 'supports', 'instance', 'The March sprint on the grant and Brightline caught up with me.', '2026-04-03'),
      { ...ev('e0902', E(22), 'supports', 'instance', 'Three flat days after the grant.', '2026-08-10'), cause: E(21) },
      ev('e0903', E(27), 'supports', 'contrast', 'Steady rather than rushed, and no dip afterwards.', '2026-09-08'),
    ],
  });
  claim('c10', 10, 'n_energy', 'raises', 'n_nf_progress', {
    via: 'Low-energy days are the ones Night Ferry sessions get cancelled.',
    evidence: [
      ev('e1001', E(22), 'supports', 'instance', 'Cancelled the Thursday Night Ferry session.', '2026-08-10'),
      ev('e1003', E(22), 'supports', 'mechanism', 'Three flat days after the grant. Admin only. Cancelled the Thursday Night Ferry session.', '2026-08-10'),
      ev('e1002', E(5), 'supports', 'instance', 'Couldn’t start anything on Monday.', '2026-04-03'),
    ],
  });
  claim('c11', 11, 'n_scopeadd', 'lowers', 'n_nf_progress', {
    via: 'Each added storyline sends the animatic back a step.',
    rivalIds: ['c01'],
    at: '2026-07-10',
    evidence: [
      ev('e1101', E(12), 'supports', 'instance', 'Rewrote the Night Ferry treatment again and added a second storyline.', '2026-07-10'),
      ev('e1102', E(6), 'supports', 'contrast', 'A fixed brief shipped on time.', '2026-07-10'),
    ],
  });
  claim('c12', 12, 'n_f_judged', 'raises', 'n_scopeadd', {
    aspect: { from: 'when it is strong' },
    via: 'Added scope works as insurance against judgement of the simpler version.',
    at: '2026-07-10',
    evidence: [ev('e1201', E(12), 'supports', 'instance', 'Honest reason: I’m scared the simple version isn’t impressive enough for festivals.', '2026-07-10')],
  });
  claim('c13', 13, 'n_deepwork', 'raises', 'n_nf_progress', {
    via: 'Uninterrupted mornings are when finished work happens.',
    at: '2026-06-03',
    view: { stance: 'agree', at: T('2026-06-16') },
    evidence: [
      ev('e1301', E(6), 'supports', 'instance', 'Mornings only, phone in another room.', '2026-06-03'),
      ev('e1302', E(14), 'supports', 'instance', 'Finished animatic act one.', '2026-06-16'),
      ev(
        'e1303',
        X(1),
        'supports',
        'intervention',
        'EXP-01: 10 of 10 protected mornings, two deliverables finished (baseline: 0–1 a fortnight).',
        '2026-06-16',
      ),
      ev('e1304', E(27), 'supports', 'instance', 'Scenes 1–3 locked using the Tuesday and Thursday blocks.', '2026-09-08'),
    ],
  });
  claim('c14', 14, 'n_afternoons', 'raises', 'n_fragment', {
    via: 'Calls cut the afternoon into pieces too small for creative work.',
    evidence: [
      ev('e1401', E(8), 'supports', 'instance', 'Nothing creative has happened after 2pm since March.', '2026-04-28'),
      ev('e1402', E(14), 'supports', 'instance', 'Afternoons still chaotic.', '2026-06-16'),
      ev('e1403', E(8), 'supports', 'mechanism', 'Every afternoon this month had at least two calls.', '2026-04-28'),
    ],
  });
  claim('c15', 15, 'n_concentration', 'raises', 'n_f_money', {
    aspect: { to: 'it growing' },
    via: 'If one client leaves, runway drops to six weeks.',
    at: '2026-07-29',
    evidence: [ev('e1501', E(20), 'supports', 'instance', 'If one leaves, I’m at six weeks.', '2026-07-29')],
  });
  claim('c16', 16, 'n_f_money', 'raises', 'n_yes', {
    aspect: { from: 'when it flares' },
    via: 'Paid work now feels safer than protected time.',
    evidence: [
      ev('e1601', E(10), 'supports', 'instance', 'Short-term money.', '2026-05-21'),
      ev('e1602', Dc(1), 'supports', 'instance', 'Accepted the full retainer, optimising for income and security.', '2026-05-21'),
    ],
  });
  claim('c17', 17, 'n_load', 'lowers', 'n_energy', {
    via: 'More commitments, fewer rest days.',
    evidence: [
      ev('e1701', E(2), 'supports', 'instance', 'Counted it: 19 hours across three projects (energy 2).', '2026-05-21'),
      ev('e1702', E(5), 'supports', 'instance', 'The March sprint on the grant and Brightline caught up with me.', '2026-04-03'),
      ev('e1703', E(29), 'supports', 'contrast', 'Down to three active things (energy 4).', '2026-09-18'),
    ],
  });
  claim('c18', 18, 'n_energy', 'raises', 'n_yes', {
    via: 'With energy, every offer looks doable.',
    at: '2026-08-14',
    evidence: [
      ev('e1801', E(1), 'supports', 'instance', 'Said yes on the call (energy 4).', '2026-08-14'),
      ev('e1802', E(4), 'supports', 'instance', 'Took the video and paused Night Ferry (energy 4).', '2026-08-14'),
      ev('e1803', E(5), 'supports', 'contrast', 'Energy 1: cancelled two calls, took nothing on.', '2026-08-14'),
    ],
  });
  claim('c19', 19, 'n_cap', 'lowers', 'n_yes', {
    via: 'A written limit makes no the default answer.',
    at: '2026-09-15',
    evidence: [ev('e1901', E(28), 'supports', 'instance', 'The commitment cap made it easy.', '2026-09-12')],
  });
  claim('c20', 20, 'n_brightline', 'sustains', 'n_runway', {
    aspect: { from: 'it continuing' },
    via: 'Two anchor clients cover the months; protected days are paid for by them.',
    at: '2026-09-01',
    evidence: [ev('e2001', E(20), 'supports', 'instance', '72% of income comes from Brightline and Fieldwork.', '2026-09-01')],
  });
  claim('c21', 21, 'n_network', 'sustains', 'n_offers', {
    aspect: { from: 'referrals coming through' },
    via: 'Referrals from two agencies and musicians keep work arriving.',
    evidence: [
      ev('e2101', E(4), 'supports', 'instance', 'Juna offered the Lowlight video.', '2026-05-21'),
      ev('e2102', E(10), 'supports', 'instance', 'They’re well connected.', '2026-05-21'),
      ev('e2103', E(24), 'supports', 'instance', 'Two enquiries since.', '2026-08-19'),
    ],
  });
  claim('c22', 22, 'n_sprint', 'raises', 'n_quality', {
    via: 'Deadlines bring out the best work.',
    rivalIds: ['c25'],
    evidence: [
      ev('e2201', E(6), 'neutral', 'elsewhere', 'Best thing I’ve made in a year, made in three calm weeks.', '2026-05-21'),
      ev('e2202', E(14), 'neutral', 'elsewhere', 'Finished act one with stress lower, no sprint.', '2026-06-16'),
    ],
  });
  claim('c23', 23, 'n_investment', 'enables', 'n_goal_studio', {
    via: 'Without outside money there is no runway to build a studio.',
    aspect: { from: 'arriving', to: 'getting started' },
    at: '2026-08-27',
  });
  // The rival to "deadlines bring out the best work": the best work came from calm, protected weeks.
  claim('c25', 25, 'n_deepwork', 'raises', 'n_quality', {
    via: 'Unbroken attention leaves room to get the details right.',
    rivalIds: ['c22'],
    at: '2026-06-16',
    evidence: [
      ev(
        'e2501',
        E(6),
        'supports',
        'instance',
        'It was the only project I touched for those three weeks: mornings only, phone in another room. Best thing I’ve made in a year.',
        '2026-06-16',
      ),
    ],
  });
  // A proposal from the analysis, not on the map until Noa adopts it.
  claim('c24', 24, 'n_concentration', 'raises', 'n_yes', {
    author: 'inferred',
    state: 'suggested',
    via: 'With most income from two clients, any new paid offer looks like insurance.',
    at: '2026-07-29',
    evidence: [
      ev('e2401', E(10), 'supports', 'instance', 'Short-term money, and they’re well connected.', '2026-07-29', 'inferred'),
      ev('e2402', E(20), 'supports', 'instance', 'If one leaves, I’m at six weeks.', '2026-07-29', 'inferred'),
    ],
  });

  // Beliefs are also claims about how life works.
  nodes.n_b_doors.claimId = 'c08';
  nodes.n_a_pressure.claimId = 'c22';
  nodes.n_a_referrals.claimId = 'c21';
  nodes.n_compounding.claimId = 'c13';
  nodes.n_barbell.claimId = 'c20';
  nodes.n_a_investment.claimId = 'c23';

  // Investigations anchored on questions.
  nodes.n_q_slip.investigation = {
    kind: 'why',
    anchorId: 'n_nf_progress',
    contrast: 'Rather than moving steadily, as it did in the Lowlight weeks and on the Tuesday and Thursday blocks.',
    claimIds: ['c01', 'c04', 'c10', 'c11'],
  };
  nodes.n_q_stop.investigation = { kind: 'what_if', anchorId: 'n_yes', claimIds: ['c02', 'c19'] };
  nodes.n_q_optimize.investigation = { kind: 'value', claimIds: [] };

  /* ------------------------------------------------------------ tests */

  const experiments: Record<string, Experiment> = {};
  const m = (id: string, label: string, baseline?: string, target?: string, result?: string, factor?: string) => ({
    id,
    label,
    baseline,
    target,
    result,
    factor,
  });

  experiments.exp_01 = {
    id: 'exp_01',
    code: 1,
    title: 'Protected morning deep work',
    hypothesis: 'Uninterrupted mornings increase finished output.',
    design: 'For two weeks: 8–11am with no calls or email, one project per block.',
    durationDays: 14,
    startDate: D('2026-06-02'),
    status: 'completed',
    claimId: 'c13',
    prediction: 'If uninterrupted mornings matter, at least two deliverables finish in the two weeks.',
    criteria: 'Fewer than two deliverables, or mornings not kept.',
    baseline: '0–1 deliverables a fortnight; mornings shared with email and calls.',
    measures: [
      m('m1', 'Mornings kept', '—', '10 of 10', '10 of 10'),
      m('m2', 'Deliverables finished', '0–1 per fortnight', '2', '2', 'n_nf_progress'),
      m('m3', 'Stress (1–5)', '4', '3', '3'),
    ],
    result: {
      outcome: 'supports',
      summary: 'Kept 10 of 10 mornings. Finished animatic act one and the Fieldwork rough cut.',
      learning: 'Mornings are my production window. Afternoons need a different kind of work.',
      sideEffects: 'Stress lower. Afternoons stayed chaotic.',
      recordedAt: T('2026-06-16'),
    },
    patternIds: ['pat_09'],
    pathIds: ['path_c'],
    questionIds: [],
    createdAt: T('2026-06-01'),
    updatedAt: T('2026-06-16'),
  };
  experiments.exp_02 = {
    id: 'exp_02',
    code: 2,
    title: 'Commitment cap',
    hypothesis: 'With fewer commitments at once, Night Ferry moves every week.',
    design: 'Maximum three active commitments for 30 days. Any new request waits for the Sunday review before I answer.',
    durationDays: 30,
    startDate: D('2026-09-15'),
    status: 'running',
    claimId: 'c01',
    prediction: 'With at most three commitments, Night Ferry advances every week and scenes 4–6 lock within the 30 days.',
    criteria: 'Fewer than two scenes locked, or the cap broken twice.',
    baseline: 'Four to five active commitments; the animatic at 30% after three months.',
    measures: [
      m('m1', 'Active commitments', '4–5', '≤ 3', undefined, 'n_load'),
      m('m2', 'Night Ferry scenes locked', '3', '6', undefined, 'n_nf_progress'),
      m('m3', 'Focus hours per week', '9', '15'),
      m('m4', 'Stress (1–5)', '4', '3'),
    ],
    patternIds: ['pat_07'],
    pathIds: ['path_c'],
    questionIds: ['n_q_stop', 'n_q_slip'],
    createdAt: T('2026-09-14'),
    updatedAt: T('2026-09-14'),
  };
  experiments.exp_03 = {
    id: 'exp_03',
    code: 3,
    title: 'Hybrid Quarter',
    hypothesis: 'Two anchor clients can fund two protected production days a week without shrinking runway.',
    design: 'Brightline plus at most one other client. Tuesday and Thursday for Night Ferry. No new commitments without the weekly review.',
    durationDays: 91,
    startDate: D('2026-09-01'),
    status: 'running',
    claimId: 'c20',
    prediction: 'Runway stays at 3.5 months or rises while Tuesdays and Thursdays stay protected.',
    criteria: 'Runway below three months, or fewer than 20 of 26 protected days kept.',
    baseline: '3.5 months of runway; no protected days.',
    measures: [
      m('m1', 'Runway (months)', '3.5', '≥ 4', undefined, 'n_runway'),
      m('m2', 'Night Ferry animatic locked', '30%', '100%', undefined, 'n_nf_progress'),
      m('m3', 'Protected days kept', '—', '24 of 26'),
    ],
    patternIds: ['pat_09'],
    pathIds: ['path_c'],
    questionIds: [],
    createdAt: T('2026-09-01'),
    updatedAt: T('2026-09-01'),
  };

  /* ------------------------------------------------------------ expectations: predictions to check */

  // Written down before their window, kept in the expected mode, never evidence of what happened.
  const expect = (
    id: string,
    label: string,
    from: string,
    until: string,
    factor: string,
    reads: FactorReading,
    basis: string[],
    written: string,
    opts: { source?: SourceRef; excerpt?: string; verdict?: NonNullable<Occurrence['expectation']>['verdict'] } = {},
  ) => {
    occurrences[id] = {
      id,
      kind: 'event',
      label,
      date: D(from),
      until: D(until),
      about: [factor],
      source: opts.source,
      excerpt: opts.excerpt,
      changes: [{ factor, reads }],
      expectation: { basis, verdict: opts.verdict },
      mode: 'expected',
      origin: 'user',
      createdAt: T(written, '21:00:00'),
    };
  };
  expect('x01', 'Night Ferry moves during the protected mornings', '2026-06-02', '2026-06-16', 'n_nf_progress', 'up', ['c13'], '2026-06-01', {
    source: X(1),
    excerpt: 'If uninterrupted mornings matter, at least two deliverables finish in the two weeks.',
  });
  expect('x02', 'Energy drops after the August grant sprint', '2026-08-03', '2026-08-12', 'n_energy', 'low', ['c09'], '2026-07-30', {
    excerpt: 'If March is anything to go by, the grant sprint will flatten me for a few days.',
  });
  expect('x03', 'Back on Night Ferry by the end of April', '2026-04-01', '2026-04-30', 'n_nf_progress', 'up', [], '2026-03-23', {
    source: Dc(3),
    excerpt: 'A three-week detour, back on Night Ferry by mid-April.',
    verdict: { outcome: 'failed', note: 'Night Ferry lost six weeks, not three.', at: T('2026-05-20') },
  });
  expect('x04', 'Night Ferry moves during the commitment cap', '2026-09-15', '2026-10-15', 'n_nf_progress', 'up', ['c01'], '2026-09-14', {
    source: X(2),
    excerpt: 'With at most three commitments, Night Ferry advances every week.',
  });
  expect('x05', 'Feeling behind eases with the cap', '2026-09-15', '2026-10-27', 'n_behind', 'down', ['c19', 'c02', 'c01', 'c05'], '2026-09-15');
  expect('x06', 'Runway grows during the Hybrid Quarter', '2026-09-01', '2026-11-30', 'n_runway', 'up', ['c20'], '2026-09-01', {
    source: Dc(8),
    excerpt: 'Runway at four months or more.',
  });

  /* ------------------------------------------------------------ patterns: regularities */

  const pev = (
    id: string,
    source: SourceRef,
    stance: Evidence['stance'],
    excerpt: string,
    addedAt: string,
    addedBy: Evidence['addedBy'] = 'inferred',
  ): Evidence => ({
    id,
    source,
    stance,
    excerpt,
    addedBy,
    addedAt: T(addedAt),
  });
  const pattern = (p: Omit<Pattern, 'createdAt' | 'updatedAt'> & { at: string }): Pattern => {
    const { at, ...rest } = p;
    return { ...rest, createdAt: T(at), updatedAt: T(at) };
  };
  const patterns: Record<string, Pattern> = {};

  patterns.pat_07 = pattern({
    id: 'pat_07',
    code: 7,
    kind: 'behavioral',
    title: 'Opportunity accumulation',
    steps: [
      { label: 'Saying yes on the spot', elementId: 'n_yes' },
      { label: 'More active commitments', elementId: 'n_load' },
      { label: 'Fragmented attention', elementId: 'n_fragment' },
    ],
    observation: 'New projects are accepted while existing ones remain unfinished.',
    triggers: ['A direct offer, especially asked on a call', 'Expectations from mentors and collaborators'],
    behaviors: ['Accepts before checking the week', 'Says yes on the call and evaluates later'],
    consequences: ['Four to five commitments at once', 'Original work slips first', 'Dormant commitments that are hard to exit'],
    evidence: [
      pev('pv0701', E(1), 'supports', 'I said yes on the call, before checking my calendar.', '2026-05-21'),
      pev('pv0702', E(2), 'supports', '11 hours on Brightline, 6 on podcast prep, 2 on Night Ferry.', '2026-05-21'),
      pev('pv0703', Dc(3), 'supports', 'Took the video and paused Night Ferry.', '2026-05-21'),
      pev('pv0704', E(10), 'supports', 'That’s five active things now.', '2026-05-21'),
      pev('pv0705', E(15), 'supports', 'I haven’t opened the project in three weeks.', '2026-06-25'),
      pev('pv0706', E(17), 'supports', 'Agreed to speak on a festival panel and run a two-day workshop.', '2026-07-09'),
      pev('pv0707', E(19), 'supports', 'Without it I say yes to things without seeing the whole week.', '2026-07-23'),
      pev('pv0708', E(30), 'supports', 'Workshop prep took both Night Ferry days this week.', '2026-09-25'),
      pev('pv0709', Dc(4), 'counters', 'Declined a role paying 40% more because it would stop my own work.', '2026-05-21', 'user'),
      pev('pv0710', E(23), 'counters', 'The podcast and the panel were deliberately exploratory.', '2026-08-14', 'user'),
      pev('pv0711', E(28), 'counters', 'Said no without agonising.', '2026-09-12', 'user'),
    ],
    explainedBy: ['c02', 'c07', 'c16', 'c06', 'c03'],
    implications: [
      { id: 'im_0701', statement: 'Accumulating commitments may reduce depth on the work that matters most.', pathIds: ['path_a', 'path_c'] },
      { id: 'im_0702', statement: 'Under the Hybrid Strategy, this is the main threat to protected production days.', pathIds: ['path_c'] },
    ],
    areas: ['work', 'projects'],
    nodeIds: ['n_yes', 'n_load', 'n_fragment', 'n_b_doors', 'n_f_missing'],
    cues: {
      supports: [
        'said yes',
        'agreed to',
        'took on',
        'another project',
        'five active',
        'jumps ahead',
        'before checking',
        'on top of',
        'collecting its bill',
        'eating the',
      ],
      counters: ['declined', 'said no', 'turned down', 'commitment cap', 'deliberately exploratory', 'only project'],
    },
    origin: 'inferred',
    at: '2026-05-21',
  });

  patterns.pat_03 = pattern({
    id: 'pat_03',
    code: 3,
    kind: 'behavioral',
    title: 'Deadline compression',
    steps: [
      { label: 'Late deadline sprint', elementId: 'n_sprint' },
      { label: 'Energy dip', elementId: 'n_energy' },
    ],
    observation: 'Work with a fixed deadline is compressed into the final days, followed by several low-energy days.',
    triggers: ['Fixed external deadlines such as grants', 'Several deadlines in the same week'],
    behaviors: ['Starts deadline work in the last three or four days', 'Late nights to finish'],
    consequences: ['Two to four flat days after submitting', 'Other commitments slip during the sprint and the dip'],
    evidence: [
      pev('pv0301', E(3), 'supports', 'I left the grant to the last four days again.', '2026-04-03'),
      pev('pv0302', E(5), 'supports', 'The March sprint on the grant and Brightline caught up with me.', '2026-04-03'),
      pev('pv0303', E(21), 'supports', 'Two all-nighters. Submitted 40 minutes before it closed.', '2026-08-10'),
      pev('pv0304', E(22), 'supports', 'Three flat days after the grant.', '2026-08-10'),
      pev('pv0305', E(27), 'counters', 'Scenes 1–3 locked using the Tuesday and Thursday blocks, steady rather than rushed.', '2026-09-08', 'user'),
    ],
    explainedBy: ['c09'],
    implications: [{ id: 'im_0301', statement: 'Recovery dips may cost about as many days as the sprint appears to save.', pathIds: ['path_a'] }],
    areas: ['health', 'projects'],
    nodeIds: ['n_sprint', 'n_energy', 'n_a_pressure'],
    cues: {
      supports: ['last minute', 'all-nighter', 'last four days', 'minutes before', 'sprint', 'flat days', 'couldn’t start', 'caught up with me'],
      counters: ['ahead of schedule', 'steady rather than rushed', 'without a sprint'],
    },
    origin: 'inferred',
    at: '2026-04-03',
  });

  patterns.pat_05 = pattern({
    id: 'pat_05',
    code: 5,
    kind: 'cognitive',
    title: 'Scope as insurance',
    steps: [
      { label: 'Fear of judgement', elementId: 'n_f_judged' },
      { label: 'Adding scope late', elementId: 'n_scopeadd' },
      { label: 'Night Ferry slips', elementId: 'n_nf_progress' },
    ],
    observation: 'When unsure whether original work is good enough, scope grows instead of the work finishing.',
    triggers: ['Doubt about whether the work is impressive enough', 'Festival or peer feedback'],
    behaviors: ['Rewrites and adds storylines late in development'],
    consequences: ['Original work slips and the release date recedes'],
    evidence: [
      pev('pv0501', E(12), 'supports', 'Added a second storyline. I’m scared the simple version isn’t impressive enough.', '2026-07-10'),
      pev('pv0502', E(16), 'supports', 'Feedback: "strong craft, unclear intention".', '2026-07-10'),
      pev('pv0503', E(6), 'counters', 'Lowlight shipped on time with a fixed brief.', '2026-07-10', 'user'),
    ],
    explainedBy: ['c12', 'c11'],
    implications: [
      { id: 'im_0501', statement: 'Night Ferry’s timeline may depend more on scope decisions than on available hours.', pathIds: ['path_a', 'path_c'] },
    ],
    areas: ['projects', 'self'],
    nodeIds: ['n_f_judged', 'n_scopeadd', 'n_recognition'],
    cues: {
      supports: ['added a second', 'rewrote', 'impressive enough', 'added scope', 'unclear intention'],
      counters: ['kept it simple', 'cut scope', 'shipped as is'],
    },
    origin: 'inferred',
    at: '2026-07-10',
  });

  patterns.pat_09 = pattern({
    id: 'pat_09',
    code: 9,
    kind: 'behavioral',
    title: 'Protected focus',
    steps: [
      { label: 'Morning deep work', elementId: 'n_deepwork' },
      { label: 'Night Ferry moves', elementId: 'n_nf_progress' },
    ],
    observation: 'Finished output clusters in periods with protected, single-project morning blocks.',
    triggers: ['Mornings without calls', 'One project per block'],
    behaviors: ['Works 8–11am on one thing, phone in another room'],
    consequences: ['Deliverables finished', 'Lower reported stress'],
    evidence: [
      pev('pv0901', E(6), 'supports', 'It was the only project I touched for those three weeks.', '2026-06-03'),
      pev('pv0902', E(14), 'supports', 'Kept 10 of 10 mornings. Finished animatic act one and the Fieldwork rough cut.', '2026-06-16'),
      pev('pv0903', E(27), 'supports', 'Scenes 1–3 locked using the Tuesday and Thursday blocks.', '2026-09-08'),
      pev('pv0904', E(30), 'counters', 'Workshop prep took both Night Ferry days this week.', '2026-09-25', 'user'),
    ],
    explainedBy: ['c13', 'c04'],
    implications: [
      { id: 'im_0901', statement: 'Paths that protect mornings keep the most productive hours; an in-house role may not.', pathIds: ['path_b', 'path_c'] },
    ],
    areas: ['place', 'projects'],
    nodeIds: ['n_deepwork', 'n_nf_progress', 'n_compounding', 'n_depth'],
    cues: {
      supports: ['deep work', 'mornings only', 'phone in another room', 'only project', 'protected', 'thursday blocks', 'locked using'],
      counters: ['couldn’t focus', 'interrupted', 'took both night ferry days'],
    },
    origin: 'inferred',
    at: '2026-06-03',
  });

  patterns.pat_02 = pattern({
    id: 'pat_02',
    code: 2,
    kind: 'behavioral',
    title: 'Pricing avoidance',
    steps: [{ label: 'Pricing avoidance' }, { label: 'Scope creep' }, { label: 'Underearning' }],
    observation: 'Pricing conversations appear to be postponed until scope has already grown.',
    triggers: ['Revision requests from existing clients'],
    behaviors: ['Delays conversations about fees'],
    consequences: ['Unpaid scope'],
    evidence: [
      pev('pv0201', Dc(1), 'supports', 'Averaged 3.5 days a week, with three extra revision rounds.', '2026-04-20'),
      pev('pv0202', E(9), 'counters', 'Asked Brightline for a scope change fee. They agreed without pushback.', '2026-05-07'),
      pev('pv0203', E(24), 'counters', 'Raised my day rate by 15% for new clients.', '2026-08-20'),
    ],
    explainedBy: [],
    implications: [],
    areas: ['money'],
    nodeIds: ['n_f_money'],
    cues: { supports: ['dreading', 'undercharged', 'unpaid'], counters: ['raised my', 'without pushback', 'scope change fee'] },
    userAssessment: {
      verdict: 'inaccurate',
      note: 'I renegotiated twice this year. The Brightline overrun was a scoping problem, not avoidance.',
      at: T('2026-05-08'),
    },
    setAside: { at: T('2026-05-08'), note: 'I renegotiated twice this year.' },
    origin: 'inferred',
    at: '2026-04-20',
  });

  /* ------------------------------------------------------------ possibility: paths */

  const path = (p: Omit<StrategicPath, 'createdAt' | 'updatedAt'>): StrategicPath => ({ ...p, createdAt: T('2026-08-27'), updatedAt: T('2026-08-27') });
  const paths: Record<string, StrategicPath> = {
    path_a: path({
      id: 'path_a',
      code: 'A',
      title: 'Studio Development',
      objective: 'Build a small studio around original animated work, starting with Night Ferry.',
      summary: 'Maximum authorship; the longest and least certain route to a sustainable income.',
      requirements: ['Night Ferry finished as proof of capability', 'A second project in development', 'At least one co-producer or funding partner'],
      dependencies: ['Funding, or 12+ months of runway', 'Reliable collaborators for 3D and sound', 'Festival or distribution interest'],
      skills: [
        { label: 'Production management', status: 'have' },
        { label: 'Creative direction', status: 'developing' },
        { label: 'Real-time 3D', status: 'developing' },
        { label: 'Business development', status: 'gap' },
        { label: 'Fundraising', status: 'gap' },
      ],
      capital: '€40–80k for the first 12 months, or co-production funding',
      time: '18–36 months to self-sustaining; close to full-time',
      risks: ['Runway runs out before funding arrives', 'Dependence on one film’s reception', 'Drift away from the client network'],
      tradeoffs: ['Most authorship and autonomy', 'Least income stability while building'],
      opportunityCosts: ['Around 70% of current client income', 'The senior in-house career track'],
      unknowns: ['Would I enjoy running people as much as making things?', 'Market appetite for Night Ferry'],
      assumptionIds: ['c23', 'c13'],
      proposedExperiments: ['Pitch Night Ferry to three co-producers with the animatic', 'Run a two-person studio sprint for two weeks'],
      experimentIds: [],
      patternIds: ['pat_05', 'pat_03'],
    }),
    path_b: path({
      id: 'path_b',
      code: 'B',
      title: 'Creative Career',
      objective: 'Move into a senior producer or creative director role at an established studio.',
      summary: 'Stability and learning at scale; original work pauses for a while.',
      requirements: ['A portfolio framed for leadership roles', 'Two or three warm introductions'],
      dependencies: ['Hiring cycles at target studios', 'Remote or hybrid options, or relocation'],
      skills: [
        { label: 'Production management', status: 'have' },
        { label: 'Creative direction', status: 'developing' },
        { label: 'Team leadership', status: 'developing' },
      ],
      capital: 'Low. Income rises within about three months',
      time: '3–6 months to transition',
      risks: ['Original work paused indefinitely', 'Tension with autonomy as a value'],
      tradeoffs: ['Stability and scale versus authorship', 'A predictable schedule, which Sam values'],
      opportunityCosts: ['The Night Ferry timeline', 'Independent client relationships'],
      unknowns: ['Would a senior role include real creative authorship?', 'How much does autonomy matter day to day, rather than in principle?'],
      assumptionIds: ['c21'],
      proposedExperiments: ['Three informational conversations with creative directors', 'A four-week contract inside a studio'],
      experimentIds: [],
      patternIds: ['pat_09'],
    }),
    path_c: path({
      id: 'path_c',
      code: 'C',
      title: 'Hybrid Strategy',
      objective: 'Two anchor clients fund protected time for one original production at a time.',
      summary: 'Stability and authorship at the same time, each at partial depth.',
      requirements: ['A cap of three active commitments', 'Two protected production days a week', 'A quarterly review of all commitments'],
      dependencies: ['Anchor clients stay (72% concentration)', 'The commitment cap holds under real offers'],
      skills: [
        { label: 'Production management', status: 'have' },
        { label: 'Boundary setting with clients', status: 'developing' },
        { label: 'Business development', status: 'gap' },
      ],
      capital: 'Low. Funded by client work; runway target four months or more',
      time: '90-day test, then a 12-month structure',
      risks: ['Client work expands into protected days (see Pattern 07)', 'Slower original output than Path A', 'Income concentration'],
      tradeoffs: ['Stability plus authorship, both at partial depth'],
      opportunityCosts: ['A faster studio build', 'A senior-role salary'],
      unknowns: ['Are two days a week enough momentum for Night Ferry?'],
      assumptionIds: ['c01', 'c13', 'c19', 'c20'],
      proposedExperiments: [],
      experimentIds: ['exp_02', 'exp_03', 'exp_01'],
      patternIds: ['pat_07', 'pat_09'],
    }),
  };

  /* ------------------------------------------------------------ planned: the chosen direction */

  const wk = (date: string) => weekStart(D(date));
  const navigation: AtlasData['navigation'] = {
    pathId: 'path_c',
    committedAt: D('2026-09-01'),
    position: 'Week 5 of the Hybrid Quarter. Active commitments down from five to three.',
    objective: {
      title: 'A sustainable two-track practice',
      description: 'A stable client base funds one original production. Night Ferry is released by next autumn.',
      targetDate: D('2027-09-01'),
    },
    experimentId: 'exp_03',
    milestone: { title: 'Night Ferry animatic locked', due: D('2026-10-30') },
    targets: [
      { id: 't1', title: 'Reduce to three active commitments', due: D('2026-09-20'), done: true },
      { id: 't2', title: 'Lock animatic scenes 1–6', due: D('2026-10-15'), done: false },
      { id: 't3', title: 'Runway back to four months', due: D('2026-10-15'), done: false },
      { id: 't4', title: 'Four consecutive Sunday reviews', due: D('2026-10-11'), done: false },
    ],
    actions: [
      { id: 'a01', title: 'Lock scene 3 with Juna’s temp score', targetId: 't2', week: wk('2026-09-14'), status: 'done' },
      { id: 'a02', title: 'Tell Marta the podcast is paused', targetId: 't1', week: wk('2026-09-14'), status: 'done' },
      { id: 'a03', title: 'Sunday review #1', targetId: 't4', week: wk('2026-09-14'), status: 'done' },
      { id: 'a04', title: 'Workshop deck first draft', week: wk('2026-09-21'), status: 'done' },
      { id: 'a05', title: 'Scene 4 thumbnails', targetId: 't2', week: wk('2026-09-21'), status: 'skipped' },
      { id: 'a06', title: 'Sunday review #2', targetId: 't4', week: wk('2026-09-21'), status: 'done' },
      { id: 'a07', title: 'Scene 4 layout pass (Tuesday block)', targetId: 't2', week: wk('2026-09-28'), status: 'todo' },
      { id: 'a08', title: 'Scene 5 rough boards (Thursday block)', targetId: 't2', week: wk('2026-09-28'), status: 'todo' },
      { id: 'a09', title: 'Invoice Brightline milestone 2', targetId: 't3', week: wk('2026-09-28'), status: 'done' },
      { id: 'a10', title: 'Cut the workshop deck to 20 slides', week: wk('2026-09-28'), status: 'todo' },
      { id: 'a11', title: 'Sunday review #3', targetId: 't4', week: wk('2026-09-28'), status: 'todo' },
    ],
    currentActionId: 'a07',
  };

  /* ------------------------------------------------------------ the history of understanding */

  const log: ModelUpdate[] = [
    {
      id: 'log_01',
      at: T('2026-04-03'),
      kind: 'pattern_created',
      summary: 'Pattern 03 proposed from Entry #03 and Entry #05.',
      patternId: 'pat_03',
      after: 'emerging',
    },
    { id: 'log_02', at: T('2026-04-20'), kind: 'pattern_created', summary: 'Pattern 02 proposed from Decision #01.', patternId: 'pat_02', after: 'emerging' },
    {
      id: 'log_03',
      at: T('2026-05-07'),
      kind: 'evidence_added',
      summary: 'Entry #09 added as a counter-case to Pattern 02.',
      patternId: 'pat_02',
      source: E(9),
    },
    {
      id: 'log_04',
      at: T('2026-05-08'),
      kind: 'pattern_set_aside',
      summary: 'You said Pattern 02 does not match your experience and set it aside. It stays here for reference.',
      patternId: 'pat_02',
    },
    {
      id: 'log_05',
      at: T('2026-05-21'),
      kind: 'pattern_created',
      summary: 'Pattern 07 proposed from five entries and Decision #03, with Decision #04 as a counter-case.',
      patternId: 'pat_07',
      after: 'recurring',
    },
    {
      id: 'log_06',
      at: T('2026-05-21'),
      kind: 'element_adopted',
      summary: 'You confirmed the belief “Saying no closes doors”, proposed by the analysis. It is now on your map.',
    },
    {
      id: 'log_07',
      at: T('2026-05-21'),
      kind: 'claim_added',
      summary: 'You added Claim 01: active commitments may lower Night Ferry progress.',
      claimId: 'c01',
      after: 'plausible',
    },
    {
      id: 'log_08',
      at: T('2026-06-16'),
      kind: 'experiment_result',
      summary: 'EXP-01 supported Claim 13: morning deep work raises Night Ferry progress.',
      claimId: 'c13',
      before: 'plausible',
      after: 'tested',
      source: X(1),
    },
    {
      id: 'log_09',
      at: T('2026-07-10'),
      kind: 'pattern_created',
      summary: 'Pattern 05 proposed from Entry #12 and Entry #16.',
      patternId: 'pat_05',
      after: 'emerging',
    },
    {
      id: 'log_10',
      at: T('2026-08-14'),
      kind: 'evidence_added',
      summary: 'You added Entry #23 as a counter-case to Pattern 07.',
      patternId: 'pat_07',
      source: E(23),
    },
    {
      id: 'log_11',
      at: T('2026-08-19'),
      kind: 'evidence_added',
      summary: 'Entry #24 added as a counter-case to Claim 08 (declining lowers future offers).',
      claimId: 'c08',
      before: 'plausible',
      after: 'weakened',
      source: E(24),
    },
    { id: 'log_12', at: T('2026-09-01'), kind: 'direction_set', summary: 'You chose Path C (Hybrid Strategy) as a 90-day test.' },
    {
      id: 'log_13',
      at: T('2026-09-08'),
      kind: 'evidence_added',
      summary: 'Entry #27 added as a contrast case to Claim 01.',
      claimId: 'c01',
      before: 'plausible',
      after: 'supported',
      source: E(27),
    },
  ];

  /* ------------------------------------------------------------ assemble */

  const now = T('2026-09-28');
  const area = (key: AreaKey, statement: string, summary: string) => ({ key, statement, summary, updatedAt: now });
  const loopId = (...ids: string[]) => [...ids].sort().join('|');
  const data: AtlasData = {
    profile: { name: SEED_PROFILE_NAME, since: D('2026-02-01') },
    areas: {
      self: area('self', 'Creative producer who wants to be an author', 'Autonomy and craft decide most things. Depth is stated often and tested rarely.'),
      projects: area(
        'projects',
        'Night Ferry is the priority, and it keeps slipping',
        'Three active commitments, down from five. The animatic is at scenes 1–3.',
      ),
      work: area('work', 'Freelance, almost all work by referral', 'Brightline is the anchor client. Offers kept arriving after the no to Northlight.'),
      money: area('money', '3.5 months of runway · 72% from two clients', 'The day rate went up 15% for new clients.'),
      place: area('place', 'Quiet mornings, fragmented afternoons', 'Home studio in a shared flat. Calls cluster after lunch.'),
      people: area('people', 'A small, close network', 'Collaborators, a mentor, and a partner who wants predictability.'),
      health: area('health', 'Energy dips after every sprint', 'Running is the anchor habit. Burnout week in April, a crash after the August grant.'),
      growth: area('growth', 'Strong production; business development gap', 'Direction and 3D are developing.'),
    },
    nodes,
    edges,
    claims,
    occurrences,
    entries,
    decisions,
    patterns,
    paths,
    experiments,
    currentState: {
      position: 'Freelance creative producer, four weeks into a 90-day hybrid test.',
      summary: 'Two anchor clients fund two protected production days a week for Night Ferry. Commitments are down from five to three.',
      constraints: ['3.5 months of runway', '72% of income from two clients', 'Partner wants predictable weekends', 'Afternoons fragmented by calls'],
      assets: [
        'Strong production track record',
        'Collaborators: Juna (music), Teo (3D)',
        'A mentor with a festival network',
        'Night Ferry animatic: scenes 1–3 locked',
      ],
      updatedAt: now,
    },
    navigation,
    modelLog: log,
    counters: { entry: 30, decision: 8, pattern: 9, experiment: 3, claim: 25 },
    causesLogic: 4,
    loopNames: {
      [loopId('c02', 'c03', 'c04', 'c05', 'c06')]: 'Overcommitment cycle',
      [loopId('c02', 'c17', 'c18')]: 'The exhaustion brake',
    },
  };

  // Run the local analyzer over the sample notes so every note carries the
  // same structured reading a new note gets. Older suggestions read as
  // already reviewed; the last few notes keep an open inbox.
  const reviewedBefore = D('2026-09-10');
  for (const e of Object.values(data.entries)) {
    const analysis = analyzeEntryLocally(e, data, e.createdAt);
    if (e.date < reviewedBefore) {
      for (const s of analysis.suggestions) if (s.state === 'pending') s.state = 'dismissed';
    }
    e.analysis = analysis;
  }

  return data;
}

export const SEED_PROFILE_NAME = 'Noa Varela';

/** Whether an atlas is the first example, Noa's around Night Ferry (still kept by those who opened it before). */
export const isNoaExample = (data: Pick<AtlasData, 'profile' | 'claims' | 'entries'>) =>
  data.profile?.name === SEED_PROFILE_NAME && Boolean(data.claims?.c01) && Boolean(data.entries?.ent_01);

/**
 * Whether an atlas is an example (one of the people in data/examples, or
 * Noa's): there to learn how the Atlas works, never the person's own. Notes
 * the person adds while exploring it do not make it theirs.
 */
export const isExampleAtlas = (data: Pick<AtlasData, 'profile' | 'claims' | 'entries'>) => Boolean(data.profile?.example) || isNoaExample(data);
