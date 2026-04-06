export interface FollowupStrategy {
  round: number;
  name: string;
  nameZh: string;
  dayOffset: number;
  description: string;
  angle: string;
  ctaType: string;
  ctaExample: string;
  toneTips: string;
  doNot: string[];
}

export const FOLLOWUP_STRATEGIES: FollowupStrategy[] = [
  {
    round: 1, name: 'Friendly Reminder', nameZh: '友好提醒', dayOffset: 2,
    description: 'A brief, friendly nudge referencing the previous email.',
    angle: 'Remind them you reached out, reference a specific detail from your first email.',
    ctaType: 'simple_question', ctaExample: 'Would it be helpful if I sent over 2-3 product specs that match what I saw on your site?',
    toneTips: 'Keep it under 80 words. Casual but professional.', doNot: ["Don't repeat the full pitch", "Don't say 'just following up'"],
  },
  {
    round: 2, name: 'Additional Value', nameZh: '附加价值', dayOffset: 4,
    description: 'Provide something genuinely useful — a market insight, trend data, or a relevant resource.',
    angle: 'Share an industry insight or useful comparison that relates to their business.',
    ctaType: 'resource_offer', ctaExample: 'I put together a quick comparison of the top 3 surface treatments trending in your market — want me to send it over?',
    toneTips: 'Lead with value, not with "Have you seen my email?"', doNot: ["Don't make it about you", "Don't oversell"],
  },
  {
    round: 3, name: 'Quick Yes/No', nameZh: '快速决策', dayOffset: 7,
    description: 'A very short email that makes it easy to reply with a simple yes or no.',
    angle: 'Frame the question so a one-word answer moves things forward.',
    ctaType: 'binary_choice', ctaExample: 'Quick question — would it be worth a 5-minute look at our latest collection? A simple "yes" or "not right now" works.',
    toneTips: 'Ultra-short. 3-4 sentences max.', doNot: ["Don't write a paragraph", "Don't beg"],
  },
  {
    round: 4, name: 'Social Proof', nameZh: '社会证明', dayOffset: 9,
    description: 'Reference a similar customer success story.',
    angle: 'Tell a brief story about a similar buyer who solved a pain point by working with you.',
    ctaType: 'case_reference', ctaExample: 'A similar distributor in your market switched to us last year — I can share what their first 6 months looked like.',
    toneTips: 'Storytelling tone. Keep the case study to 2-3 sentences.', doNot: ["Don't name drop without purpose", "Don't fabricate stories"],
  },
  {
    round: 5, name: 'Reduced Risk / Incentive', nameZh: '降低风险', dayOffset: 12,
    description: 'Lower the perceived risk of engaging. Offer a no-commitment sample or trial.',
    angle: 'Frame the offer as making it easier for them to evaluate.',
    ctaType: 'low_risk_offer', ctaExample: 'Happy to send a sample set — no commitment, just so you can see the quality firsthand.',
    toneTips: 'Generous tone. Investing in the relationship.', doNot: ["Don't create false urgency"],
  },
  {
    round: 6, name: 'Ask for Feedback', nameZh: '请求反馈', dayOffset: 15,
    description: 'Shift from selling to listening. Ask what would need to be true for them to consider.',
    angle: 'Show genuine curiosity about their situation.',
    ctaType: 'open_question', ctaExample: 'What would a new supplier need to offer to get on your shortlist?',
    toneTips: 'Humble, curious, and non-pushy.', doNot: ["Don't be passive-aggressive"],
  },
  {
    round: 7, name: 'Context Reminder', nameZh: '上下文提醒', dayOffset: 18,
    description: 'Bring back context from your earlier analysis of their business.',
    angle: 'Reference something specific from their website or product line.',
    ctaType: 'context_callback', ctaExample: 'I noticed your product line page was recently updated — are you looking at new collections?',
    toneTips: 'Observant and specific.', doNot: ["Don't recycle old hooks"],
  },
  {
    round: 8, name: 'Breakup Email', nameZh: '告别邮件', dayOffset: 22,
    description: 'A polite "last email" that creates soft urgency.',
    angle: 'Be honest that you don\'t want to keep filling their inbox.',
    ctaType: 'final_check', ctaExample: 'This will be my last note. If this comes back on your radar, my door is always open.',
    toneTips: 'Graceful and professional.', doNot: ["Don't be dramatic"],
  },
  {
    round: 9, name: 'New Angle Reignite', nameZh: '新角度重启', dayOffset: 28,
    description: 'After a break, come back with a completely fresh angle.',
    angle: 'Start clean with a new topic that\'s genuinely relevant.',
    ctaType: 'new_topic', ctaExample: 'With the upcoming building season, a lot of our partners are updating their range — thought this might be relevant for you too.',
    toneTips: 'Fresh and energetic.', doNot: ["Don't reference previous emails"],
  },
];

export function getStrategyForRound(round: number): FollowupStrategy | null {
  return FOLLOWUP_STRATEGIES.find(s => s.round === round) || null;
}
