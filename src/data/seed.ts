/**
 * Sample dataset: one fictional person, about seven months of records.
 *
 * Noa is a freelance creative producer deciding whether to build a small
 * animation studio, move into an in-house creative role, or run a hybrid of
 * the two. Everything here is invented. Nothing is a diagnosis: patterns are
 * observations with evidence, counter-evidence and a derived confidence.
 *
 * Dates are written against an anchor week and shifted by whole weeks at load
 * time, so the sample always reads as "recent" and weekly plans stay aligned.
 */
import { analyzeEntryLocally } from '../ai/localAnalysis';
import { computeConfidence } from '../domain/confidence';
import { hubId } from '../domain/constants';
import type {
  AtlasData,
  AtlasEdge,
  AtlasNode,
  Decision,
  DomainKey,
  Entry,
  Evidence,
  Experiment,
  ModelUpdate,
  Pattern,
  RelationType,
  SourceRef,
  StrategicPath,
} from '../domain/types';
import { addDays, daysBetween, todayISO, weekStart } from '../lib/dates';

const ANCHOR_WEEK = '2026-09-28';

export function createSeedData(today: string = todayISO()): AtlasData {
  const offset = daysBetween(ANCHOR_WEEK, weekStart(today));
  const D = (date: string) => addDays(date, offset);
  const T = (date: string, time = '09:00:00') => `${D(date)}T${time}.000Z`;

  /* ------------------------------------------------------------ nodes */

  const nodes: Record<string, AtlasNode> = {};
  const node = (
    id: string,
    label: string,
    summary: string,
    opts: Partial<Pick<AtlasNode, 'domain' | 'category' | 'origin' | 'confidence' | 'source' | 'status' | 'tags'>> & {
      at?: string;
    } = {},
  ) => {
    const at = T(opts.at ?? '2026-02-01');
    nodes[id] = {
      id,
      label,
      summary,
      domain: opts.domain,
      category: opts.category,
      origin: opts.origin ?? 'user',
      confidence: opts.confidence,
      source: opts.source,
      status: opts.status,
      tags: opts.tags ?? [],
      createdAt: at,
      updatedAt: at,
    };
  };

  // Identity
  node('n_producer', 'Creative Producer', 'Turns loose creative ideas into finished, delivered work. The self-description most confirmed by evidence.', {
    domain: 'identity',
  });
  node('n_director', 'Emerging Director', 'Wants authorship of original work, not only delivery. Supported by intent more than by shipped work so far.', {
    domain: 'identity',
  });
  node('n_operator', 'Independent Operator', 'Runs a one-person practice: clients, money, schedule, and all the decisions in between.', { domain: 'identity' });

  // Values (also in the Mind graph)
  node('n_autonomy', 'Autonomy', 'Control over what I work on and when. Decided the Northlight choice.', { domain: 'values', category: 'value' });
  node('n_craft', 'Craft', 'Work that holds up to close attention. The thing I am proudest of.', { domain: 'values', category: 'value' });
  node('n_depth', 'Depth over breadth', 'Fewer things, taken further. Stated often; tested rarely.', { domain: 'values', category: 'value' });
  node('n_stability', 'Stability', 'Enough predictability to plan a year. Matters more to Sam than I usually admit.', { domain: 'values', category: 'value' });

  // Goals
  node('n_goal_ship', 'Ship Night Ferry', 'Finish and release the animated short by mid-2027.', { domain: 'goals' });
  node('n_goal_runway', '6 months of runway', 'Currently about 3.5 months. Target by the end of the year.', { domain: 'goals' });
  node('n_goal_practice', 'Two-track practice', 'A stable client base that funds one original production at a time.', { domain: 'goals', at: '2026-09-01' });

  // Career
  node('n_freelance', 'Freelance producer', 'Three recurring clients; brand content, music videos, documentary.', { domain: 'career' });
  node('n_network', 'Agency + indie network', 'Most work arrives through referrals from two agencies and musicians.', { domain: 'career' });

  // Skills
  node('n_sk_production', 'Production management', 'Scheduling, budgets, crews. Strong and well evidenced.', { domain: 'skills', tags: ['have'] });
  node('n_sk_motion', 'Motion design', 'Solid; used on most client work.', { domain: 'skills', tags: ['have'] });
  node('n_sk_direction', 'Creative direction', 'Developing. Lowlight was the first project with full authorship.', { domain: 'skills', tags: ['developing'] });
  node('n_sk_bizdev', 'Business development', 'Gap. Work has always arrived by referral.', { domain: 'skills', tags: ['gap'] });
  node('n_sk_3d', 'Real-time 3D', 'Learning, with Teo. Needed for Night Ferry backgrounds.', { domain: 'skills', tags: ['developing'] });

  // Projects
  node('n_nightferry', 'Night Ferry', 'Animated short, ~9 minutes. Animatic scenes 1–3 locked.', { domain: 'projects' });
  node('n_brightline', 'Brightline rebrand', 'Client retainer. Anchor client #1.', { domain: 'projects' });
  node('n_workshop', 'Festival workshop', 'Two-day workshop and panel, accepted in July. Unpaid.', { domain: 'projects', at: '2026-07-08' });
  node('n_podcast', 'Working Titles podcast', 'Co-produced with Marta. Paused in September.', { domain: 'projects', at: '2026-03-02' });

  // Finance
  node('n_runway', 'Runway: 3.5 months', 'Savings divided by average monthly costs, as of late July.', { domain: 'finance' });
  node('n_concentration', 'Income concentration', '72% of income from Brightline and Fieldwork.', { domain: 'finance' });

  // Relationships
  node('n_juna', 'Juna', 'Music collaborator. Lowlight video; scoring Night Ferry.', { domain: 'relationships' });
  node('n_ruth', 'Ruth', 'Mentor; former executive producer with a festival network.', { domain: 'relationships' });
  node('n_sam', 'Sam', 'Partner. Wants more predictable evenings and weekends.', { domain: 'relationships' });
  node('n_marta', 'Marta', 'Podcast co-host; generous, persistent.', { domain: 'relationships' });

  // Environment
  node('n_studio', 'Home studio', 'Corner of a shared flat. Quiet until about 11am.', { domain: 'environment' });
  node('n_afternoons', 'Afternoons fragmented', 'At least two calls most afternoons since March.', { domain: 'environment', at: '2026-04-28' });

  // Habits
  node('n_deepwork', 'Morning deep work', '8–11am, one project, phone in another room. Kept about 70% of weekdays.', { domain: 'habits', at: '2026-06-02' });
  node('n_review', 'Sunday weekly review', 'Lapsed in July; restarted in September.', { domain: 'habits' });
  node('n_running', 'Running 3× a week', 'The most reliable habit I have.', { domain: 'habits' });

  // Mind: beliefs
  node('n_b_doors', 'Saying no closes doors', 'If I decline an opportunity, it will not come back.', {
    category: 'belief',
    origin: 'inferred',
    confidence: 0.66,
    at: '2026-05-21',
  });
  node('n_b_noticed', 'Good work gets noticed', 'Quality eventually finds its audience without much promotion.', { category: 'belief' });
  node('n_b_prove', 'I need to prove I can run a studio', 'A studio is the credential that would make the director identity real.', {
    category: 'belief',
    origin: 'inferred',
    confidence: 0.52,
    at: '2026-07-10',
  });

  // Mind: assumptions
  node('n_a_investment', 'A studio needs outside investment', 'Starting a studio is impossible without a co-producer or investor.', { category: 'assumption' });
  node('n_a_referrals', 'Clients will keep coming via referrals', 'The current pipeline will continue without active business development.', {
    category: 'assumption',
  });
  node('n_a_pressure', 'I work better under pressure', 'Deadlines bring out the best work.', { category: 'assumption' });

  // Mind: motivations
  node('n_m_recognition', 'Recognition for original work', 'To be known for something I authored, not only delivered.', { category: 'motivation' });
  node('n_m_freedom', 'Freedom over my time', 'Choosing the shape of my days.', { category: 'motivation' });
  node('n_m_outlast', 'Build something that outlasts a project', 'A body of work, or a place, that continues.', { category: 'motivation' });

  // Mind: fears
  node('n_f_missing', 'Missing the one opportunity that matters', 'That the decisive chance arrives and I turn it down.', { category: 'fear' });
  node('n_f_money', 'Financial instability', 'Runway running out with nothing lined up.', { category: 'fear' });
  node('n_f_service', 'Being seen only as a service provider', 'That the market only sees me as someone who executes other people’s ideas.', {
    category: 'fear',
  });

  // Mind: mental models
  node('n_mm_optionality', 'Optionality', 'Keep as many doors open as possible; decide later.', { category: 'mental_model' });
  node('n_mm_compounding', 'Compounding depth', 'Sustained focus on one body of work compounds; scattered effort does not.', { category: 'mental_model' });
  node('n_mm_barbell', 'Barbell strategy', 'Stable base income on one side, a few high-upside bets on the other, little in between.', {
    category: 'mental_model',
  });

  // Mind: decisions (mirror the decision log)
  node('n_d_brightline', 'Accepted Brightline retainer', 'Mirrors Decision #01.', {
    category: 'decision',
    source: { kind: 'decision', id: 'dec_01' },
    at: '2026-02-10',
  });
  node('n_d_lowlight', 'Paused Night Ferry for Lowlight', 'Mirrors Decision #03.', {
    category: 'decision',
    source: { kind: 'decision', id: 'dec_03' },
    at: '2026-03-23',
  });
  node('n_d_northlight', 'Declined Northlight role', 'Mirrors Decision #04.', {
    category: 'decision',
    source: { kind: 'decision', id: 'dec_04' },
    at: '2026-04-18',
  });
  node('n_d_hybrid', 'Committed to Hybrid Quarter', 'Mirrors Decision #08.', {
    category: 'decision',
    source: { kind: 'decision', id: 'dec_08' },
    at: '2026-09-01',
  });

  // Mind: experiences (mirror entries)
  node('n_e_burnout', 'Burnout week (April)', 'Mirrors Entry #05.', { category: 'experience', source: { kind: 'entry', id: 'ent_05' }, at: '2026-04-02' });
  node('n_e_lowlight', 'Lowlight: three focused weeks', 'Mirrors Entry #06.', {
    category: 'experience',
    source: { kind: 'entry', id: 'ent_06' },
    at: '2026-04-15',
  });
  node('n_e_rejection', 'Tidewater festival rejection', 'Mirrors Entry #16.', {
    category: 'experience',
    source: { kind: 'entry', id: 'ent_16' },
    at: '2026-07-03',
  });

  // Mind: questions
  node('n_q_optimize', 'What kind of work do I actually want to optimize for?', 'Authorship, craft, income and recognition point in different directions.', {
    category: 'question',
    status: 'exploring',
    at: '2026-05-27',
  });
  node('n_q_stop', 'Which opportunities should I stop accepting?', 'Ruth asked what I would cut if I had to drop half. I could not answer quickly.', {
    category: 'question',
    status: 'open',
    at: '2026-07-15',
  });
  node('n_q_untested', 'What assumptions about my career have not been tested?', 'Several plans rest on things I have never checked.', {
    category: 'question',
    status: 'open',
    at: '2026-08-27',
  });
  node('n_q_inherited', 'Which goals are genuinely mine versus externally inherited?', 'The studio goal might partly be other people’s idea of success.', {
    category: 'question',
    status: 'open',
    at: '2026-07-10',
  });
  node('n_q_recognition', 'Would I still want a studio without the recognition?', 'Separates the work itself from how it would be seen.', {
    category: 'question',
    status: 'open',
    at: '2026-07-10',
  });

  /* ------------------------------------------------------------ edges */

  const edges: Record<string, AtlasEdge> = {};
  let edgeN = 0;
  const edge = (source: string, relation: RelationType, target: string, note?: string) => {
    const id = `edge_${String(++edgeN).padStart(3, '0')}`;
    edges[id] = { id, source, target, relation, note, origin: 'user', createdAt: T('2026-02-01') };
  };
  const H = (k: DomainKey) => hubId(k);

  // Orbit: how the domains relate
  edge('n_producer', 'supports', H('career'));
  edge('n_producer', 'influences', H('projects'));
  edge('n_producer', 'derived_from', H('skills'));
  edge('n_producer', 'supports', H('values'));
  edge(H('values'), 'influences', H('goals'));
  edge(H('goals'), 'influences', H('projects'));
  edge(H('skills'), 'supports', H('career'));
  edge(H('finance'), 'depends_on', H('career'));
  edge(H('projects'), 'conflicts', H('habits'), 'Commitment overload erodes routines first.');
  edge(H('environment'), 'influences', H('habits'));
  edge(H('relationships'), 'supports', H('career'), 'Nearly all work arrives by referral.');
  // Orbit: item-level
  edge('n_director', 'depends_on', 'n_sk_direction');
  edge('n_operator', 'depends_on', 'n_sk_bizdev');
  edge('n_craft', 'supports', 'n_director');
  edge('n_autonomy', 'supports', 'n_freelance');
  edge('n_stability', 'conflicts', 'n_autonomy');
  edge('n_nightferry', 'supports', 'n_goal_ship');
  edge('n_brightline', 'supports', 'n_runway');
  edge('n_brightline', 'conflicts', 'n_nightferry');
  edge('n_workshop', 'conflicts', 'n_nightferry', 'Prep is using the protected Night Ferry days.');
  edge('n_goal_runway', 'depends_on', 'n_brightline');
  edge('n_concentration', 'conflicts', 'n_stability');
  edge('n_goal_practice', 'depends_on', 'n_review');
  edge('n_deepwork', 'supports', 'n_nightferry');
  edge('n_afternoons', 'conflicts', 'n_deepwork');
  edge('n_juna', 'supports', 'n_nightferry');
  edge('n_ruth', 'influences', 'n_director');
  edge('n_sam', 'influences', 'n_stability');
  edge('n_marta', 'influences', 'n_podcast');
  edge('n_sk_3d', 'supports', 'n_nightferry');
  edge('n_network', 'supports', 'n_freelance');
  // Mind
  edge('n_f_missing', 'causes', 'n_b_doors');
  edge('n_mm_optionality', 'supports', 'n_b_doors');
  edge('n_mm_compounding', 'conflicts', 'n_mm_optionality');
  edge('n_depth', 'conflicts', 'n_mm_optionality');
  edge('n_b_doors', 'influences', 'n_d_brightline');
  edge('n_b_doors', 'influences', 'n_d_lowlight');
  edge('n_f_money', 'influences', 'n_d_brightline');
  edge('n_d_brightline', 'causes', 'n_e_burnout');
  edge('n_e_lowlight', 'contradicts', 'n_a_pressure');
  edge('n_e_burnout', 'contradicts', 'n_a_pressure');
  edge('n_autonomy', 'influences', 'n_d_northlight');
  edge('n_m_freedom', 'supports', 'n_autonomy');
  edge('n_m_recognition', 'influences', 'n_b_prove');
  edge('n_e_rejection', 'influences', 'n_m_recognition');
  edge('n_f_service', 'influences', 'n_b_prove');
  edge('n_b_prove', 'derived_from', 'n_m_recognition');
  edge('n_mm_barbell', 'supports', 'n_d_hybrid');
  edge('n_e_lowlight', 'influences', 'n_d_hybrid');
  edge('n_m_outlast', 'supports', 'n_depth');
  edge('n_f_money', 'conflicts', 'n_m_freedom');
  edge('n_b_noticed', 'influences', 'n_a_referrals');
  edge('n_stability', 'conflicts', 'n_m_freedom');
  edge('n_q_stop', 'examines', 'n_b_doors');
  edge('n_q_optimize', 'examines', 'n_craft');
  edge('n_q_optimize', 'examines', 'n_m_recognition');
  edge('n_q_untested', 'examines', 'n_a_referrals');
  edge('n_q_untested', 'examines', 'n_a_investment');
  edge('n_q_untested', 'examines', 'n_a_pressure');
  edge('n_q_inherited', 'examines', 'n_b_prove');
  edge('n_q_inherited', 'examines', 'n_goal_ship');
  edge('n_q_recognition', 'examines', 'n_m_recognition');
  edge('n_q_recognition', 'examines', 'n_m_outlast');

  /* ------------------------------------------------------------ entries */

  const entries: Record<string, Entry> = {};
  const entry = (
    seq: number,
    date: string,
    kind: Entry['kind'],
    title: string,
    content: string,
    domains: DomainKey[],
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
      domains,
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
    ['projects', 'relationships'],
    ['opportunity', 'podcast'],
    ['n_podcast', 'n_marta', 'n_b_doors'],
    { energy: 4, mood: 1, emotions: ['excited'] },
  );
  entry(
    2,
    '2026-03-09',
    'reflection',
    'Where the week went',
    'Counted it: 11 hours on Brightline, 6 on podcast prep, 2 on Night Ferry. Night Ferry is the thing I say matters most, and it got the least.',
    ['projects', 'goals'],
    ['time-audit', 'focus'],
    ['n_nightferry', 'n_brightline', 'n_podcast'],
    { energy: 2, mood: -1, emotions: ['scattered'] },
  );
  entry(
    3,
    '2026-03-18',
    'problem',
    'Three deadlines in the same week',
    'Brightline v2, the podcast episode 1 edit and the grant application all land on Friday. I left the grant to the last four days again.',
    ['projects'],
    ['deadline', 'grant'],
    ['n_brightline', 'n_podcast'],
    { energy: 2, mood: -1, emotions: ['anxious'] },
  );
  entry(
    4,
    '2026-03-23',
    'journal',
    'Juna’s music video',
    'Juna offered the "Lowlight" video: tight budget, great song, three weeks. I’m pausing Night Ferry for it. Told myself it’s a portfolio piece.',
    ['projects', 'relationships', 'career'],
    ['opportunity', 'music-video'],
    ['n_juna', 'n_nightferry'],
    { energy: 4, mood: 1, emotions: ['excited'] },
  );
  entry(
    5,
    '2026-04-02',
    'experience',
    'Burnout week',
    'Couldn’t start anything on Monday. Slept ten hours, cancelled two calls. The March sprint on the grant and Brightline caught up with me.',
    ['habits', 'environment'],
    ['recovery', 'energy'],
    [],
    { energy: 1, mood: -2, emotions: ['tired'] },
  );
  entry(
    6,
    '2026-04-15',
    'experience',
    'Lowlight shipped in three focused weeks',
    'Finished the Lowlight video on time. It was the only project I touched for those three weeks: mornings only, phone in another room. Best thing I’ve made in a year.',
    ['projects', 'habits'],
    ['focus', 'finished', 'deep-work'],
    ['n_deepwork', 'n_juna', 'n_sk_direction'],
    { energy: 4, mood: 2, emotions: ['proud'] },
  );
  entry(
    7,
    '2026-04-19',
    'reflection',
    'Declining Northlight',
    'Turned down the in-house creative lead role. The salary was 40% above my average month. What decided it: I would stop producing my own work for at least two years.',
    ['career', 'values', 'finance'],
    ['autonomy', 'decline'],
    ['n_autonomy', 'n_freelance'],
    { energy: 3, mood: 0, emotions: ['uncertain', 'relieved'] },
  );
  entry(
    8,
    '2026-04-28',
    'observation',
    'Afternoons are gone',
    'Every afternoon this month had at least two calls. Nothing creative has happened after 2pm since March.',
    ['environment', 'habits'],
    ['calls', 'schedule'],
    ['n_afternoons'],
  );
  entry(
    9,
    '2026-05-06',
    'journal',
    'Rate conversation with Brightline',
    'Asked Brightline for a scope change fee after the third round of revisions. They agreed without pushback. I had been dreading it for two weeks for nothing.',
    ['finance', 'career'],
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
    ['projects', 'finance'],
    ['opportunity', 'income'],
    ['n_freelance', 'n_runway'],
    { energy: 3, mood: 0 },
  );
  entry(
    11,
    '2026-05-20',
    'problem',
    'Night Ferry keeps slipping',
    'The animatic was supposed to be locked in April. It’s late May and I’ve done maybe 30% of it. Every week something paid jumps ahead.',
    ['projects', 'goals'],
    ['night-ferry', 'slipping'],
    ['n_nightferry', 'n_goal_ship'],
    { energy: 2, mood: -1, emotions: ['frustrated'] },
  );
  entry(
    12,
    '2026-05-27',
    'reflection',
    'Why I add scope',
    'Rewrote the Night Ferry treatment again and added a second storyline. Honest reason: I’m scared the simple version isn’t impressive enough for festivals.',
    ['projects', 'identity'],
    ['scope', 'festival'],
    ['n_nightferry', 'n_m_recognition'],
    { energy: 3, mood: -1, emotions: ['uncertain'] },
  );
  entry(
    13,
    '2026-06-02',
    'observation',
    'Deep-work experiment: day 1',
    'Starting two weeks of protected 8–11am blocks. No calls, no email. One project per block.',
    ['habits'],
    ['deep-work', 'experiment'],
    ['n_deepwork'],
  );
  entry(
    14,
    '2026-06-16',
    'reflection',
    'Deep-work experiment: results',
    'Kept 10 of 10 mornings. Finished animatic act one and the Fieldwork rough cut. Stress lower. Afternoons still chaotic.',
    ['habits', 'projects'],
    ['deep-work', 'finished'],
    ['n_deepwork', 'n_nightferry', 'n_afternoons'],
    { energy: 4, mood: 1, emotions: ['focused'] },
  );
  entry(
    15,
    '2026-06-24',
    'journal',
    'Podcast stalled',
    'Two episodes recorded in four months. Marta wants to keep going; I haven’t opened the project in three weeks and I don’t know how to say I’m out.',
    ['projects', 'relationships'],
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
    ['career', 'identity'],
    ['festival', 'feedback'],
    ['n_m_recognition'],
    { energy: 2, mood: -2, emotions: ['frustrated'] },
  );
  entry(
    17,
    '2026-07-08',
    'journal',
    'Panel and workshop: yes',
    'Agreed to speak on a festival panel and run a two-day workshop in late September. Visibility, and Ruth thinks it would be good for me. It’s unpaid.',
    ['career', 'relationships', 'projects'],
    ['opportunity', 'visibility'],
    ['n_workshop', 'n_ruth'],
    { energy: 3, mood: 1 },
  );
  entry(
    18,
    '2026-07-15',
    'reflection',
    'Mentor call with Ruth',
    'Ruth asked what I would stop doing if I had to cut half my projects. I couldn’t answer quickly. She said that was the answer.',
    ['relationships', 'goals'],
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
    ['habits'],
    ['weekly-review'],
    ['n_review'],
    { energy: 2, mood: -1 },
  );
  entry(
    20,
    '2026-07-29',
    'problem',
    'Runway check',
    'Ran the numbers: 3.5 months of runway. 72% of income comes from Brightline and Fieldwork. If one leaves, I’m at six weeks.',
    ['finance'],
    ['runway', 'concentration'],
    ['n_runway', 'n_concentration', 'n_f_money', 'n_a_referrals'],
    { energy: 2, mood: -1, emotions: ['anxious'] },
  );
  entry(
    21,
    '2026-08-05',
    'journal',
    'Grant deadline sprint, again',
    'Two all-nighters for the development grant. Submitted 40 minutes before it closed. Same shape as March.',
    ['projects'],
    ['grant', 'deadline'],
    ['n_a_pressure'],
    { energy: 2, mood: -1, emotions: ['tired'] },
  );
  entry(
    22,
    '2026-08-09',
    'experience',
    'Crash after the grant',
    'Three flat days after the grant. Admin only. Cancelled the Thursday Night Ferry session.',
    ['habits'],
    ['recovery'],
    [],
    { energy: 1, mood: -1, emotions: ['tired'] },
  );
  entry(
    23,
    '2026-08-14',
    'observation',
    'Exploration is not the same as overcommitment',
    'Looking back, the podcast and the panel were deliberately exploratory: I wanted to find out whether I like being on the talking side of the work. That is different from overcommitting by accident.',
    ['projects', 'identity'],
    ['exploration'],
    ['n_podcast', 'n_workshop'],
  );
  entry(
    24,
    '2026-08-19',
    'journal',
    'New day rate',
    'Raised my day rate by 15% for new clients. Two enquiries since; one accepted without question.',
    ['finance'],
    ['pricing'],
    ['n_runway'],
    { energy: 3, mood: 1 },
  );
  entry(
    25,
    '2026-08-27',
    'reflection',
    'What Hybrid would actually look like',
    'Two anchor clients, three days a week. Night Ferry gets Tuesday and Thursday, protected. Everything else waits for the quarterly review. Sam would get predictable weekends.',
    ['goals', 'career', 'projects'],
    ['strategy', 'hybrid'],
    ['n_goal_practice', 'n_mm_barbell', 'n_sam'],
    { energy: 4, mood: 1, emotions: ['calm'] },
  );
  entry(
    26,
    '2026-09-01',
    'goal',
    'Hybrid Quarter',
    'Committing to a 90-day test of the hybrid structure. Success means: animatic locked, runway at four months or more, and no new commitments without the Sunday review.',
    ['goals'],
    ['hybrid', 'experiment'],
    ['n_goal_practice', 'n_d_hybrid'],
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
    ['n_nightferry', 'n_deepwork'],
    { energy: 4, mood: 1, emotions: ['focused'] },
  );
  entry(
    28,
    '2026-09-12',
    'journal',
    'Declined a pitch video',
    'A friend’s startup wanted a pitch video in two weeks. First time this year I said no without agonising: the commitment cap made it easy.',
    ['projects', 'values'],
    ['decline', 'commitment-cap'],
    [],
    { energy: 3, mood: 1, emotions: ['calm'] },
  );
  entry(
    29,
    '2026-09-18',
    'journal',
    'Commitment cap: first week',
    'Down to three active things: Brightline, Night Ferry and workshop prep. Fieldwork wrapped; the podcast is paused and Marta took it well. Focus hours are up, though I keep reaching for my inbox.',
    ['projects', 'habits'],
    ['commitment-cap'],
    ['n_podcast', 'n_marta'],
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
    ['n_workshop', 'n_nightferry'],
    { energy: 2, mood: -1, emotions: ['frustrated'] },
  );

  /* ------------------------------------------------------------ decisions */

  const decisions: Record<string, Decision> = {};
  const decision = (seq: number, date: string, d: Omit<Decision, 'id' | 'seq' | 'date' | 'createdAt' | 'updatedAt'>) => {
    const id = `dec_${String(seq).padStart(2, '0')}`;
    decisions[id] = { ...d, id, seq, date: D(date), createdAt: T(date, '18:00:00'), updatedAt: T(date, '18:00:00') };
  };
  const opt = (id: string, label: string, rationale: string) => ({ id, label, rationale });

  decision(1, '2026-02-10', {
    title: 'Accept the Brightline rebrand retainer',
    context: 'Brightline offered a six-month retainer for their rebrand just as Night Ferry pre-production was starting.',
    options: [
      opt('o1', 'Accept the full retainer', 'Six months of steady income from a client I like.'),
      opt('o2', 'Accept at reduced scope', 'Protect two days a week for Night Ferry.'),
      opt('o3', 'Decline', 'Keep Night Ferry on schedule.'),
    ],
    chosenOptionId: 'o1',
    chosenAction: 'Accepted the full retainer.',
    expectedOutcome: 'Stable income for about two days a week.',
    actualOutcome: 'Averaged 3.5 days a week, with three extra revision rounds.',
    outcomeRating: 'worse',
    learned: 'Retainers need a revision cap written into the scope.',
    optimizingFor: ['Income', 'Security'],
    domains: ['career', 'finance', 'projects'],
    tags: ['client'],
    nodeIds: ['n_brightline'],
    reviewedAt: T('2026-05-06'),
  });
  decision(2, '2026-03-02', {
    title: 'Co-produce the Working Titles podcast',
    context: 'Marta asked on a call whether I would co-produce her interview podcast.',
    options: [
      opt('o1', 'Say yes', 'Visibility, and working with Marta is fun.'),
      opt('o2', 'Advise only', 'Stay involved at a lower cost.'),
      opt('o3', 'Decline', 'No capacity until Night Ferry’s animatic is locked.'),
    ],
    chosenOptionId: 'o1',
    chosenAction: 'Said yes on the call.',
    expectedOutcome: 'A light side project, about three hours a week.',
    actualOutcome: 'Two episodes in four months; it became a weight I avoided.',
    outcomeRating: 'worse',
    learned: 'I say yes on calls before checking capacity.',
    optimizingFor: ['Opportunity', 'Visibility', 'Relationships'],
    domains: ['projects', 'relationships'],
    tags: ['opportunity'],
    nodeIds: ['n_podcast', 'n_marta'],
    reviewedAt: T('2026-06-24'),
  });
  decision(3, '2026-03-23', {
    title: 'Pause Night Ferry for the Lowlight music video',
    context: 'Juna offered a three-week music video with a tight budget and a great song.',
    options: [
      opt('o1', 'Take it and pause Night Ferry', 'Portfolio piece with full creative control.'),
      opt('o2', 'Take it and run both', 'Keep momentum on Night Ferry.'),
      opt('o3', 'Decline', 'Night Ferry is the priority.'),
    ],
    chosenOptionId: 'o1',
    chosenAction: 'Took the video and paused Night Ferry.',
    expectedOutcome: 'A three-week detour, back on Night Ferry by mid-April.',
    actualOutcome: 'The video shipped on time and was strong; Night Ferry lost six weeks, not three.',
    outcomeRating: 'mixed',
    learned: 'Restarting a paused project costs more than the pause itself.',
    optimizingFor: ['Opportunity', 'Visibility', 'Craft'],
    domains: ['projects', 'career', 'relationships'],
    tags: ['opportunity', 'music-video'],
    nodeIds: ['n_juna', 'n_nightferry'],
    reviewedAt: T('2026-05-20'),
  });
  decision(4, '2026-04-18', {
    title: 'Decline the Northlight creative lead role',
    context: 'Northlight offered an in-house creative lead position at 40% above my average monthly income.',
    options: [
      opt('o1', 'Accept', 'Financial stability and a team to lead.'),
      opt('o2', 'Negotiate a three-day contract', 'Keep some time for my own work.'),
      opt('o3', 'Decline', 'Keep time for original work; accept income volatility.'),
    ],
    chosenOptionId: 'o3',
    chosenAction: 'Declined, with a note to stay in touch.',
    expectedOutcome: 'More time for original work, with less predictable income.',
    actualOutcome: 'No regret so far; the time went into Lowlight and Night Ferry.',
    outcomeRating: 'as_expected',
    learned: 'A clear reason made the no easy: it would have stopped my own work for two years.',
    optimizingFor: ['Autonomy', 'Long-term growth', 'Craft'],
    domains: ['career', 'values', 'finance'],
    tags: ['decline'],
    nodeIds: ['n_autonomy', 'n_freelance'],
    reviewedAt: T('2026-07-15'),
  });
  decision(5, '2026-05-12', {
    title: 'Take the Fieldwork documentary edit',
    context: 'Fieldwork needed an editor for four weeks. Well connected, good rate.',
    options: [
      opt('o1', 'Accept four weeks', 'Money now and a useful network.'),
      opt('o2', 'Consult one day a week', 'Keep the relationship at a lower cost.'),
      opt('o3', 'Decline', 'Already running four things.'),
    ],
    chosenOptionId: 'o1',
    chosenAction: 'Accepted the four-week edit.',
    expectedOutcome: 'Four weeks, good money, useful contacts.',
    actualOutcome: 'Stretched to seven weeks alongside Brightline.',
    outcomeRating: 'worse',
    learned: 'My estimates ignore what is already on the plate.',
    optimizingFor: ['Income', 'Opportunity', 'Relationships'],
    domains: ['projects', 'finance', 'career'],
    tags: ['opportunity', 'income'],
    nodeIds: ['n_freelance', 'n_runway'],
    reviewedAt: T('2026-07-01'),
  });
  decision(6, '2026-07-08', {
    title: 'Speak on the festival panel and run the workshop',
    context: 'A festival invited me to a panel and to run a two-day workshop in late September. Unpaid.',
    options: [
      opt('o1', 'Yes to both', 'Visibility with programmers; Ruth recommended it.'),
      opt('o2', 'Panel only', 'Visibility at a fraction of the prep.'),
      opt('o3', 'Decline both', 'Protect September for Night Ferry.'),
    ],
    chosenOptionId: 'o1',
    chosenAction: 'Said yes to both.',
    expectedOutcome: 'Visibility and new contacts for about four days of prep.',
    actualOutcome: 'Prep is already at six days and is using the Night Ferry blocks.',
    outcomeRating: 'worse',
    optimizingFor: ['Visibility', 'Opportunity', 'Relationships'],
    domains: ['career', 'projects', 'relationships'],
    tags: ['opportunity', 'visibility'],
    nodeIds: ['n_workshop', 'n_ruth'],
    reviewedAt: T('2026-09-24'),
  });
  decision(7, '2026-08-19', {
    title: 'Raise the day rate by 15% for new clients',
    context: 'Runway is short and income is concentrated. Existing clients stay on current rates.',
    options: [
      opt('o1', 'Raise by 15%', 'Test the market without scaring anyone off.'),
      opt('o2', 'Raise by 25%', 'Closer to comparable producers.'),
      opt('o3', 'Keep the rate', 'Avoid losing enquiries while runway is short.'),
    ],
    chosenOptionId: 'o1',
    chosenAction: 'Raised the rate by 15% for new enquiries.',
    expectedOutcome: 'Fewer but better-paid projects.',
    actualOutcome: 'One of two enquiries accepted without pushback.',
    outcomeRating: 'as_expected',
    optimizingFor: ['Income', 'Long-term growth'],
    domains: ['finance'],
    tags: ['pricing'],
    nodeIds: ['n_runway'],
    reviewedAt: T('2026-09-12'),
  });
  decision(8, '2026-09-01', {
    title: 'Commit to the Hybrid Strategy as a 90-day test',
    context: 'Compared the three paths after the runway check. Path A needs more runway than I have; Path B pauses original work.',
    options: [
      opt('o1', 'Path A: studio full-time', 'Fastest route to authorship, but 3.5 months of runway is not enough.'),
      opt('o2', 'Path B: apply for senior roles', 'Stability and learning at scale; original work pauses.'),
      opt('o3', 'Path C: hybrid for 90 days', 'Tests whether client work can fund protected production time.'),
    ],
    chosenOptionId: 'o3',
    chosenAction: 'Started the Hybrid Quarter: two anchor clients, Tuesday and Thursday for Night Ferry.',
    expectedOutcome: 'Animatic locked, runway at four months or more, fewer commitments.',
    optimizingFor: ['Focus', 'Long-term growth', 'Security'],
    domains: ['goals', 'career', 'projects'],
    tags: ['strategy', 'hybrid'],
    nodeIds: ['n_goal_practice', 'n_mm_barbell'],
  });

  /* ------------------------------------------------------------ experiments */

  const experiments: Record<string, Experiment> = {};
  const m = (id: string, label: string, baseline?: string, target?: string, result?: string) => ({ id, label, baseline, target, result });

  experiments.exp_01 = {
    id: 'exp_01',
    code: 1,
    title: 'Protected morning deep work',
    hypothesis: 'Uninterrupted mornings increase finished output.',
    design: 'For two weeks: 8–11am with no calls or email, one project per block.',
    durationDays: 14,
    startDate: D('2026-06-02'),
    status: 'completed',
    measures: [
      m('m1', 'Mornings kept', '—', '10 of 10', '10 of 10'),
      m('m2', 'Deliverables finished', '0–1 per fortnight', '2', '2'),
      m('m3', 'Stress (1–5)', '4', '3', '3'),
    ],
    result: {
      outcome: 'supports',
      summary: 'Kept 10 of 10 mornings. Finished animatic act one and the Fieldwork rough cut.',
      learning: 'Mornings are my production window. Afternoons need a different kind of work.',
      recordedAt: T('2026-06-16'),
    },
    patternLinks: [{ patternId: 'pat_09', ifSupported: 'supports' }],
    pathIds: ['path_c'],
    questionIds: [],
    createdAt: T('2026-06-01'),
    updatedAt: T('2026-06-16'),
  };
  experiments.exp_02 = {
    id: 'exp_02',
    code: 2,
    title: 'Commitment cap',
    hypothesis: 'I may perform better with fewer simultaneous projects.',
    design: 'Maximum three active commitments for 30 days. Any new request waits for the Sunday review before I answer.',
    durationDays: 30,
    startDate: D('2026-09-15'),
    status: 'running',
    measures: [
      m('m1', 'Completion rate (weekly actions done)', '45%', '70%'),
      m('m2', 'Focus hours per week', '9', '15'),
      m('m3', 'Stress (1–5)', '4', '3'),
      m('m4', 'Output quality, self-rated (1–5)', '3', '4'),
    ],
    patternLinks: [{ patternId: 'pat_07', ifSupported: 'supports' }],
    pathIds: ['path_c'],
    questionIds: ['n_q_stop'],
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
    measures: [
      m('m1', 'Runway (months)', '3.5', '≥ 4'),
      m('m2', 'Night Ferry animatic locked', '30%', '100%'),
      m('m3', 'Protected days kept', '—', '24 of 26'),
    ],
    patternLinks: [{ patternId: 'pat_09', ifSupported: 'supports' }],
    pathIds: ['path_c'],
    questionIds: ['n_q_optimize'],
    createdAt: T('2026-09-01'),
    updatedAt: T('2026-09-01'),
  };
  experiments.exp_04 = {
    id: 'exp_04',
    code: 4,
    title: 'Co-producer pitch test',
    hypothesis: 'Night Ferry can attract a co-producer before the film is finished.',
    design: 'Pitch to three co-producers with the animatic and a one-page treatment within six weeks.',
    durationDays: 42,
    status: 'proposed',
    measures: [m('m1', 'Co-producers pitched', '0', '3'), m('m2', 'Follow-up meetings', '0', '1')],
    patternLinks: [],
    pathIds: ['path_a'],
    questionIds: ['n_q_untested'],
    createdAt: T('2026-09-10'),
    updatedAt: T('2026-09-10'),
  };

  /* ------------------------------------------------------------ patterns */

  const ev = (
    id: string,
    source: SourceRef,
    stance: Evidence['stance'],
    excerpt: string,
    addedAt: string,
    weight = 1,
    addedBy: Evidence['addedBy'] = 'inferred',
  ): Evidence => ({ id, source, stance, excerpt, weight, addedBy, addedAt: T(addedAt) });
  const E = (n: number): SourceRef => ({ kind: 'entry', id: `ent_${String(n).padStart(2, '0')}` });
  const Dc = (n: number): SourceRef => ({ kind: 'decision', id: `dec_${String(n).padStart(2, '0')}` });

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
    chain: ['Opportunity Accumulation', 'Overcommitment', 'Fragmentation'],
    status: 'active',
    observation: 'I repeatedly accept new projects while existing projects remain unfinished.',
    triggers: [
      'New opportunities, especially when asked directly',
      'External expectations from mentors and collaborators',
      'Fear of missing the opportunity that matters',
    ],
    behaviors: ['Accepts parallel commitments before checking capacity', 'Says yes on the call and evaluates later'],
    consequences: ['Attention fragmented across four to six commitments', 'Original work slips first', 'Dormant commitments that are hard to exit'],
    evidence: [
      ev('ev_0701', E(1), 'supports', 'I said yes on the call, before checking my calendar.', '2026-05-21'),
      ev('ev_0702', E(2), 'supports', '11 hours on Brightline, 6 on podcast prep, 2 on Night Ferry.', '2026-05-21'),
      ev('ev_0703', Dc(3), 'supports', 'Took the video and paused Night Ferry; Night Ferry lost six weeks, not three.', '2026-05-21'),
      ev('ev_0704', E(10), 'supports', 'That’s five active things now.', '2026-05-21'),
      ev('ev_0705', E(11), 'supports', 'Every week something paid jumps ahead.', '2026-05-21'),
      ev('ev_0706', E(15), 'supports', 'I haven’t opened the project in three weeks and I don’t know how to say I’m out.', '2026-06-25'),
      ev('ev_0707', E(17), 'supports', 'Agreed to speak on a festival panel and run a two-day workshop.', '2026-07-09'),
      ev('ev_0708', E(19), 'supports', 'Without it I say yes to things without seeing the whole week.', '2026-07-23'),
      ev('ev_0709', E(30), 'supports', 'Workshop prep took both Night Ferry days this week.', '2026-09-25'),
      ev('ev_0710', Dc(4), 'counters', 'Declined a role paying 40% more because it would stop my own work.', '2026-05-21', 1, 'user'),
      ev('ev_0711', E(23), 'counters', 'The podcast and the panel were deliberately exploratory.', '2026-08-14', 1, 'user'),
    ],
    interpretations: [
      {
        id: 'int_0701',
        statement: 'May prioritise acquiring opportunities over completing them.',
        confidence: 0.72,
        rationale: 'Most accepted commitments were chosen for visibility or income while an unfinished original project was active.',
      },
      {
        id: 'int_0702',
        statement: 'May be a reasonable response to income concentration: saying yes spreads financial risk.',
        confidence: 0.41,
        rationale: 'Two acceptances coincided with runway concerns (Entry #10, Entry #20).',
      },
    ],
    counterEvidence: [
      { id: 'ce_0701', statement: 'Several projects were intentionally exploratory, chosen to learn rather than accumulated by default.', sources: [E(23)] },
      { id: 'ce_0702', statement: 'A large, well-paid offer was declined when it clearly threatened original work.', sources: [Dc(4)] },
    ],
    implications: [
      { id: 'im_0701', statement: 'Parallel project accumulation may reduce execution depth on the work that matters most.', pathIds: ['path_a', 'path_c'] },
      { id: 'im_0702', statement: 'Under the Hybrid Strategy, this pattern is the main threat to protected production days.', pathIds: ['path_c'] },
    ],
    domains: ['projects', 'career', 'habits'],
    nodeIds: ['n_b_doors', 'n_f_missing', 'n_mm_optionality', 'n_d_brightline', 'n_d_lowlight'],
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
    chain: ['Deadline Compression', 'Late Sprint', 'Recovery Dip'],
    status: 'active',
    observation: 'Work with a fixed deadline tends to be compressed into the final days, followed by several low-energy days.',
    triggers: ['Fixed external deadlines such as grants', 'Several deadlines landing in the same week'],
    behaviors: ['Starts deadline work in the last three or four days', 'Late nights to finish'],
    consequences: ['A two-to-four-day recovery dip after submission', 'Other commitments slip during the sprint and the dip'],
    evidence: [
      ev('ev_0301', E(3), 'supports', 'I left the grant to the last four days again.', '2026-04-03'),
      ev('ev_0302', E(5), 'supports', 'The March sprint on the grant and Brightline caught up with me.', '2026-04-03'),
      ev('ev_0303', E(21), 'supports', 'Two all-nighters. Submitted 40 minutes before it closed.', '2026-08-10'),
      ev('ev_0304', E(22), 'supports', 'Three flat days after the grant.', '2026-08-10'),
      ev('ev_0305', E(27), 'counters', 'Scenes 1–3 locked using the Tuesday and Thursday blocks, steady rather than rushed.', '2026-09-08', 1, 'user'),
    ],
    interpretations: [
      { id: 'int_0301', statement: 'Compressed timelines may be how urgency gets created when many commitments compete for the same days.', confidence: 0.58 },
      {
        id: 'int_0302',
        statement: 'May reflect an untested assumption that pressure improves the work.',
        confidence: 0.46,
        rationale: 'Linked to the assumption "I work better under pressure", which two experiences contradict.',
      },
    ],
    counterEvidence: [{ id: 'ce_0301', statement: 'Deadline work spread across protected blocks moved steadily without a sprint.', sources: [E(27)] }],
    implications: [{ id: 'im_0301', statement: 'Recovery dips may cost about as many days as the sprint appears to save.', pathIds: ['path_a'] }],
    domains: ['projects', 'habits'],
    nodeIds: ['n_a_pressure', 'n_e_burnout'],
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
    chain: ['Uncertain Value', 'Scope Expansion', 'Delayed Release'],
    status: 'emerging',
    observation: 'When unsure whether original work is good enough, I add scope instead of finishing it.',
    triggers: ['Doubt about whether the work is impressive enough', 'Festival or peer feedback'],
    behaviors: ['Rewrites and adds storylines late in development'],
    consequences: ['Original work slips and the release date recedes'],
    evidence: [
      ev('ev_0501', E(12), 'supports', 'Added a second storyline. I’m scared the simple version isn’t impressive enough.', '2026-07-10'),
      ev('ev_0502', E(16), 'supports', 'Feedback: "strong craft, unclear intention".', '2026-07-10'),
      ev('ev_0503', E(6), 'counters', 'Lowlight shipped on time with a fixed brief.', '2026-07-10', 1, 'user'),
    ],
    interpretations: [{ id: 'int_0501', statement: 'Added scope may work as insurance against judgement of the simpler version.', confidence: 0.55 }],
    counterEvidence: [{ id: 'ce_0501', statement: 'Work with a fixed brief (Lowlight) shipped simple and on time.', sources: [E(6)] }],
    implications: [
      { id: 'im_0501', statement: 'Night Ferry’s timeline may depend more on scope decisions than on available hours.', pathIds: ['path_a', 'path_c'] },
    ],
    domains: ['projects', 'identity'],
    nodeIds: ['n_m_recognition', 'n_f_service', 'n_b_prove'],
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
    chain: ['Protected Focus', 'Single-Project Attention', 'Finished Work'],
    status: 'active',
    observation: 'Finished output clusters in periods with protected, single-project morning blocks.',
    triggers: ['Mornings without calls', 'One project per block'],
    behaviors: ['Works 8–11am on one thing, phone in another room'],
    consequences: ['Deliverables finished', 'Lower reported stress'],
    evidence: [
      ev('ev_0901', E(6), 'supports', 'It was the only project I touched for those three weeks.', '2026-06-03'),
      ev('ev_0902', E(14), 'supports', 'Kept 10 of 10 mornings. Finished animatic act one and the Fieldwork rough cut.', '2026-06-16'),
      ev(
        'ev_0903',
        { kind: 'experiment', id: 'exp_01' },
        'supports',
        'EXP-01 supported the hypothesis: 10 of 10 mornings, two deliverables finished.',
        '2026-06-16',
        2,
        'user',
      ),
      ev('ev_0904', E(27), 'supports', 'Scenes 1–3 locked using the Tuesday and Thursday blocks.', '2026-09-08'),
    ],
    interpretations: [{ id: 'int_0901', statement: 'Output may depend more on uninterrupted attention than on total hours worked.', confidence: 0.7 }],
    counterEvidence: [],
    implications: [
      { id: 'im_0901', statement: 'Paths that protect mornings keep the most productive hours; an in-house role may not.', pathIds: ['path_b', 'path_c'] },
    ],
    domains: ['habits', 'projects'],
    nodeIds: ['n_e_lowlight', 'n_mm_compounding', 'n_depth'],
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
    chain: ['Pricing Avoidance', 'Scope Creep', 'Underearning'],
    status: 'dismissed',
    observation: 'Pricing conversations appear to be postponed until scope has already grown.',
    triggers: ['Revision requests from existing clients'],
    behaviors: ['Delays conversations about fees'],
    consequences: ['Unpaid scope'],
    evidence: [
      ev('ev_0201', Dc(1), 'supports', 'Averaged 3.5 days a week, with three extra revision rounds.', '2026-04-20'),
      ev('ev_0202', E(9), 'counters', 'Asked Brightline for a scope change fee. They agreed without pushback.', '2026-05-07'),
      ev('ev_0203', E(24), 'counters', 'Raised my day rate by 15% for new clients.', '2026-08-20'),
    ],
    interpretations: [{ id: 'int_0201', statement: 'May avoid conflict in client relationships.', confidence: 0.35 }],
    counterEvidence: [{ id: 'ce_0201', statement: 'Fees were renegotiated twice this year without difficulty.', sources: [E(9), E(24)] }],
    implications: [],
    domains: ['finance'],
    nodeIds: ['n_f_money'],
    cues: { supports: ['dreading', 'undercharged', 'unpaid'], counters: ['raised my', 'without pushback', 'scope change fee'] },
    userAssessment: {
      verdict: 'inaccurate',
      note: 'I renegotiated twice this year. The Brightline overrun was a scoping problem, not avoidance.',
      at: T('2026-05-08'),
    },
    origin: 'inferred',
    at: '2026-04-20',
  });

  /* ------------------------------------------------------------ paths */

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
      unknowns: [
        'Does a studio actually need outside investment? (untested)',
        'Would I enjoy running people as much as making things?',
        'Market appetite for Night Ferry',
      ],
      proposedExperiments: ['Run a two-person studio sprint for two weeks'],
      experimentIds: ['exp_04'],
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
        { label: 'Motion design', status: 'have' },
        { label: 'Creative direction', status: 'developing' },
        { label: 'Team leadership', status: 'developing' },
      ],
      capital: 'Low. Income rises within about three months',
      time: '3–6 months to transition',
      risks: ['Original work paused indefinitely', 'Tension with autonomy as a value'],
      tradeoffs: ['Stability and scale versus authorship', 'A predictable schedule, which Sam values'],
      opportunityCosts: ['The Night Ferry timeline', 'Independent client relationships'],
      unknowns: ['Would a senior role include real creative authorship?', 'How much does autonomy matter day to day, rather than in principle?'],
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
      unknowns: ['Can the commitment cap hold under real opportunities?', 'Are two days a week enough momentum for Night Ferry?'],
      proposedExperiments: [],
      experimentIds: ['exp_02', 'exp_03', 'exp_01'],
      patternIds: ['pat_07', 'pat_09'],
    }),
  };

  /* ------------------------------------------------------------ navigation */

  const wk = (date: string) => weekStart(D(date));
  const navigation: AtlasData['navigation'] = {
    pathId: 'path_c',
    committedAt: D('2026-09-01'),
    position: 'Week 5 of the Hybrid Quarter. Active commitments down from six to three.',
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

  /* ------------------------------------------------------------ model log */

  const conf = (ids: string[], p: Pattern) => computeConfidence(p.evidence.filter((e) => ids.includes(e.id)));
  const log: ModelUpdate[] = [
    {
      id: 'log_01',
      at: T('2026-04-03'),
      kind: 'pattern_created',
      summary: 'Pattern 03 proposed from Entry #03 and Entry #05.',
      patternId: 'pat_03',
      after: conf(['ev_0301', 'ev_0302'], patterns.pat_03),
    },
    {
      id: 'log_02',
      at: T('2026-04-20'),
      kind: 'pattern_created',
      summary: 'Pattern 02 proposed from Decision #01.',
      patternId: 'pat_02',
      after: conf(['ev_0201'], patterns.pat_02),
    },
    {
      id: 'log_03',
      at: T('2026-05-07'),
      kind: 'evidence_added',
      summary: 'Entry #09 added as counter-evidence to Pattern 02.',
      patternId: 'pat_02',
      before: conf(['ev_0201'], patterns.pat_02),
      after: conf(['ev_0201', 'ev_0202'], patterns.pat_02),
      source: E(9),
    },
    {
      id: 'log_04',
      at: T('2026-05-08'),
      kind: 'pattern_assessed',
      summary: 'You marked Pattern 02 as not accurate. It was dismissed and no longer informs paths.',
      patternId: 'pat_02',
    },
    {
      id: 'log_05',
      at: T('2026-05-21'),
      kind: 'pattern_created',
      summary: 'Pattern 07 proposed from five entries and Decision #03, with Decision #04 as counter-evidence.',
      patternId: 'pat_07',
      after: conf(['ev_0701', 'ev_0702', 'ev_0703', 'ev_0704', 'ev_0705', 'ev_0710'], patterns.pat_07),
    },
    {
      id: 'log_06',
      at: T('2026-06-16'),
      kind: 'experiment_result',
      summary: 'EXP-01 result applied: supports Pattern 09 (weight 2).',
      patternId: 'pat_09',
      before: conf(['ev_0901', 'ev_0902'], patterns.pat_09),
      after: conf(['ev_0901', 'ev_0902', 'ev_0903'], patterns.pat_09),
      source: { kind: 'experiment', id: 'exp_01' },
    },
    {
      id: 'log_07',
      at: T('2026-07-10'),
      kind: 'pattern_created',
      summary: 'Pattern 05 proposed as emerging, from Entry #12 and Entry #16.',
      patternId: 'pat_05',
      after: conf(['ev_0501', 'ev_0502'], patterns.pat_05),
    },
    {
      id: 'log_08',
      at: T('2026-08-14'),
      kind: 'evidence_added',
      summary: 'You added Entry #23 as counter-evidence to Pattern 07.',
      patternId: 'pat_07',
      source: E(23),
    },
    { id: 'log_09', at: T('2026-09-01'), kind: 'direction_set', summary: 'You chose Path C (Hybrid Strategy) as a 90-day test.' },
  ];

  /* ------------------------------------------------------------ assemble */

  const now = T('2026-09-28');
  const domain = (key: DomainKey, statement: string, summary: string) => ({ key, statement, summary, updatedAt: now });
  const data: AtlasData = {
    profile: { name: 'Noa Varela', since: D('2026-02-01') },
    domains: {
      identity: domain('identity', 'Creative Producer', 'Turns loose ideas into finished work. Wants to be an author, not only a producer.'),
      values: domain('values', 'Autonomy · Craft · Depth', 'Autonomy decided the Northlight choice. Depth is stated often and tested rarely.'),
      goals: domain('goals', 'Ship Night Ferry; six months of runway', 'Two concrete goals and one structural goal from the Hybrid Quarter.'),
      career: domain('career', 'Freelance producer, three recurring clients', 'Brand content, music videos and documentary, almost all by referral.'),
      skills: domain(
        'skills',
        'Strong production; business development gap',
        'Production and motion design are well evidenced. Direction and 3D are developing.',
      ),
      projects: domain('projects', 'Three active (down from six)', 'Night Ferry, Brightline and workshop prep. Podcast paused, Fieldwork wrapped.'),
      finance: domain('finance', '3.5 months runway · 72% concentration', 'Two clients provide most income. Rate raised 15% for new clients.'),
      relationships: domain('relationships', 'A small, close network', 'Collaborators, a mentor, and a partner who wants predictability.'),
      environment: domain('environment', 'Quiet mornings, fragmented afternoons', 'Home studio in a shared flat. Calls cluster after lunch.'),
      habits: domain('habits', 'Morning deep work kept ~70%', 'Weekly review restarted in September. Running is the anchor habit.'),
    },
    nodes,
    edges,
    entries,
    decisions,
    patterns,
    paths,
    experiments,
    currentState: {
      position: 'Freelance creative producer, four weeks into a 90-day hybrid test.',
      summary: 'Two anchor clients fund two protected production days a week for Night Ferry. Commitments are down from six to three.',
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
    counters: { entry: 30, decision: 8, pattern: 9, experiment: 4 },
  };

  // Run the local analyzer over the sample entries so every entry carries the
  // same structured observations a new entry gets. Older suggestions read as
  // already reviewed; the last few entries keep an open analysis inbox.
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
