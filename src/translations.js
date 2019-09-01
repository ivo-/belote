const TRANSLATIONS = {
  // Constants
  belot: 'белот',

  tierce: 'терца',
  quarte: 'кварта',
  quinte: 'квинта',

  fourA: 'четири аса',
  fourK: 'четири попа',
  fourQ: 'четири дами',
  four10: 'четири десетки',
  fourJ: 'четири валета',
  four9: 'четири деветки',

  SPADES: 'спатия',
  DIAMONDS: 'каро',
  HEARTS: 'купа',
  CLUBS: 'пика',

  NO_TRUMPS: 'без коз',
  ALL_TRUMPS: 'всичко коз',

  PASS: 'пас',
  DOUBLE: 'контра',
  RE_DOUBLE: 'ре-контра',

  // Messages
  select_card: 'Изберете карта',

  // Questions
  wanna_declare: 'Искате ли да обявите',

  // Answers
  yes: 'Да',
  no: 'Не',
};

export const t = key => {
  if (!TRANSLATIONS.hasOwnProperty(key)) {
    throw new Error(`No translation for: ${key}`);
  }

  return TRANSLATIONS[key];
};
