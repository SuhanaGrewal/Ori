// Time-of-day landing greeting, shown centered on a fresh open - same
// spirit as claude.ai's own rotating greeting, but tuned for "assistant
// at your desk" rather than a generic chatbot. A few variants per bucket
// so it doesn't feel identical every single time; picked randomly on
// each mount rather than cycling deterministically, since nothing here
// needs to be reproducible.
const BUCKETS = [
  { maxHour: 5, messages: ["Burning the midnight oil?", "Still up. What's on your mind?", "Working late tonight?"] },
  { maxHour: 9, messages: ["The early bird gets the worm. Caffeinated yet?", "Good morning. What's first?", "Early start today."] },
  { maxHour: 12, messages: ["Good morning. What's on deck?", "Morning. What do you need?"] },
  { maxHour: 17, messages: ["Good afternoon. What's on your mind?", "Afternoon. What can I dig up for you?"] },
  { maxHour: 21, messages: ["Good evening. Wrapping up, or just getting started?", "Evening. What's on your mind?"] },
  { maxHour: 24, messages: ["Still at it?", "Late one. What do you need?", "Burning the midnight oil?"] },
];

export function getGreeting(now = new Date()) {
  const hour = now.getHours();
  const bucket = BUCKETS.find((b) => hour < b.maxHour) || BUCKETS[BUCKETS.length - 1];
  const messages = bucket.messages;
  return messages[Math.floor(Math.random() * messages.length)];
}
