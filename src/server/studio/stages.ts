export const stages = ['discovered','researching','audited','demo_in_progress','demo_ready','contacted','replied','meeting_booked','proposal_sent','won','lost','archived'] as const;
export type Stage = typeof stages[number];
export const transitions: Record<Stage, readonly Stage[]> = {
  discovered:['researching','archived'], researching:['discovered','audited','archived'],
  audited:['researching','demo_in_progress','archived'], demo_in_progress:['audited','demo_ready','archived'],
  demo_ready:['demo_in_progress','contacted','archived'], contacted:['replied','lost','archived'],
  replied:['meeting_booked','proposal_sent','lost','archived'], meeting_booked:['replied','proposal_sent','lost','archived'],
  proposal_sent:['meeting_booked','won','lost','archived'], won:['archived'], lost:['researching','archived'], archived:['discovered'],
};
export const stageLabel = (value:string) => value.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
export function assertTransition(before:Stage,after:Stage){if(before!==after&&!transitions[before].includes(after))throw new Error('This lifecycle transition is not allowed.');}
