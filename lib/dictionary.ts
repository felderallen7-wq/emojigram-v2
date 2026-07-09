export const DICTIONARY: Record<string, string> = {
  // greetings & reactions
  hello: '👋', hi: '👋', hey: '👋', bye: '👋', yes: '👍', no: '👎',
  ok: '👌', okay: '👌', please: '🙏', thanks: '🙏', thank: '🙏', sorry: '🙏',
  love: '❤️', heart: '❤️', like: '👍', good: '👍', great: '🎉', bad: '👎',
  happy: '😊', smile: '😊', sad: '😢', cry: '😭', laugh: '😂', funny: '😂',
  lol: '😂', angry: '😠', mad: '😠', tired: '😴', sleep: '😴', wow: '😮',
  cool: '😎', hot: '🥵', cold: '🥶', sick: '🤒', hug: '🤗', kiss: '😘',
  maybe: '🤷', help: '🆘', stop: '🛑', wait: '⏳', congrats: '🎊', luck: '🍀',
  // time
  time: '⏰', late: '⏰', today: '📅', tomorrow: '📅', tonight: '🌙',
  night: '🌙', morning: '🌅', day: '☀️', week: '🗓️', weekend: '🎉',
  // food & drink
  food: '🍔', eat: '🍽️', hungry: '🤤', dinner: '🍽️', lunch: '🥪',
  breakfast: '🥞', pizza: '🍕', burger: '🍔', taco: '🌮', sushi: '🍣',
  coffee: '☕', tea: '🍵', beer: '🍺', wine: '🍷', cake: '🍰', icecream: '🍦',
  // activities & things
  party: '🎉', celebrate: '🎉', birthday: '🎂', gift: '🎁', music: '🎵',
  song: '🎵', dance: '💃', movie: '🎬', film: '🎬', game: '🎮', play: '🎮',
  win: '🏆', money: '💰', pay: '💸', buy: '🛒', shop: '🛍️', work: '💼',
  job: '💼', school: '🏫', study: '📚', book: '📖', read: '📖', write: '✍️',
  idea: '💡', think: '🤔', question: '❓', why: '❓', what: '❓',
  phone: '📱', call: '📞', text: '💬', message: '💬', talk: '🗣️',
  run: '🏃', walk: '🚶', gym: '🏋️', soccer: '⚽', football: '🏈',
  basketball: '🏀', ball: '⚽', watch: '👀', see: '👀', look: '👀',
  hear: '👂', listen: '👂', know: '🧠', learn: '📚', fire: '🔥', water: '💧',
  // places & travel
  home: '🏠', house: '🏠', car: '🚗', drive: '🚗', bus: '🚌', train: '🚆',
  plane: '✈️', fly: '✈️', travel: '🧳', trip: '🧳', beach: '🏖️', ocean: '🌊',
  mountain: '⛰️', tree: '🌳', flower: '🌸', star: '⭐', moon: '🌙',
  sun: '☀️', rain: '🌧️', snow: '❄️', world: '🌍',
  // people & animals
  friend: '🫂', family: '👪', baby: '👶', dog: '🐶', cat: '🐱',
  fish: '🐟', bird: '🐦', king: '👑', queen: '👑', strong: '💪',
  doctor: '🩺', medicine: '💊',
  // misc
  new: '✨', fast: '⚡', slow: '🐢', big: '🐘', small: '🐜', magic: '✨',
  cheers: '🥂', goal: '🥅', winner: '🏆', photo: '📷', video: '📹',
};

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z']+/g) ?? [];
}

function lookup(word: string): string | undefined {
  if (Object.hasOwn(DICTIONARY, word)) return DICTIONARY[word];
  // naive plural: cats -> cat
  const singular = word.endsWith('s') ? word.slice(0, -1) : undefined;
  if (singular && Object.hasOwn(DICTIONARY, singular)) return DICTIONARY[singular];
  return undefined;
}

export function dictionaryTranslate(text: string): string {
  const parts = text.match(/\p{RGI_Emoji}|[a-zA-Z']+/gv) ?? [];
  const out = parts
    .map((part) => (/^[a-zA-Z']+$/.test(part) ? lookup(part.toLowerCase()) : part))
    .filter((emoji): emoji is string => Boolean(emoji));
  return out.length > 0 ? out.join('') : '🤷';
}

export function dictionaryHints(text: string): string {
  return tokenize(text)
    .map((word) => {
      const emoji = lookup(word);
      return emoji ? `${word} → ${emoji}` : null;
    })
    .filter(Boolean)
    .join(', ');
}
