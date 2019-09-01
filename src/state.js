import produce from 'immer';
import { shuffle, sortArrBy } from './util';

// =============================================================================
// Constants

export const CARDS_LIST = [
  {
    rank: 7,
    power: 0,
    points: 0,
    allTrumpsPower: 0,
    allTrumpsPoints: 0,
  },
  {
    rank: 8,
    power: 1,
    points: 0,
    allTrumpsPower: 1,
    allTrumpsPoints: 0,
  },
  {
    rank: 9,
    power: 2,
    points: 0,
    allTrumpsPower: 6,
    allTrumpsPoints: 14,
  },
  {
    rank: 10,
    power: 3,
    points: 10,
    allTrumpsPower: 2,
    allTrumpsPoints: 10,
  },
  {
    rank: 'J',
    power: 4,
    points: 2,
    allTrumpsPower: 7,
    allTrumpsPoints: 20,
  },
  {
    rank: 'Q',
    power: 5,
    points: 3,
    allTrumpsPower: 3,
    allTrumpsPoints: 3,
  },
  {
    rank: 'K',
    power: 6,
    points: 4,
    allTrumpsPower: 4,
    allTrumpsPoints: 4,
  },
  {
    rank: 'A',
    power: 7,
    points: 11,
    allTrumpsPower: 5,
    allTrumpsPoints: 11,
  },
];

export const SUITES = {
  SPADES: 'SPADES',
  DIAMONDS: 'DIAMONDS',
  HEARTS: 'HEARTS',
  CLUBS: 'CLUBS',
};

export const CARDS = {
  SPADES: {},
  HEARTS: {},
  DIAMONDS: {},
  CLUBS: {}
};
Object.keys(CARDS).forEach(suite => {
  CARDS_LIST.forEach((card, power) => {
    CARDS[suite][card.rank] = {
      ...card,
      suite,
    };
  });
});

export const CLAIMS = {
  ...SUITES,

  NO_TRUMPS: 'NO_TRUMPS',
  ALL_TRUMPS: 'ALL_TRUMPS',

  // Multipliers
  DOUBLE: 'DOUBLE',
  RE_DOUBLE: 'RE_DOUBLE',

  PASS: 'PASS',
};

// Claims ordered by `power`.
const CLAIMS_ORDER = [
  CLAIMS.SPADES,
  CLAIMS.DIAMONDS,
  CLAIMS.HEARTS,
  CLAIMS.CLUBS,
  CLAIMS.NO_TRUMPS,
  CLAIMS.ALL_TRUMPS,
  CLAIMS.PASS,
];

// Different possible game states.
export const STATE = {
  CLAIMING: 'claiming',
  PLAYING: 'playing',
  FINISHED: 'finished',
};

/**
 * Returns list of all the cards in random order.
 * @returns {Array}
 */
export function getShuffledDeck() {
  const cards = Object
        .values(CARDS)
        .map(s => Object.values(s))
        .reduce((res, arr) => res.concat(arr), []);
  shuffle(cards);
  return cards;
}

export const INITIAL_STATE = {
  /**
   * Array that holds all the available cards that are not yet dealt.
   */
  deck: getShuffledDeck(),

  /**
   * Array containing history of what is claimed.
   */
  claims: [
    // FORMAT: [player_id, claim]
    // [2, SPADES], [1, DIAMONDS], ...
  ],

  /**
   * Holds the *index* of the current player.
   */
  currentPlayer: 0,

  /**
   * An array for cards currently played on the "table".
   */
  currentCards: [],

  /**
   * Holds the players list.
   */
  players: [
    // DEBUG:
    //
    // { id: 1, name: 'a', cards: [], points: [], declarations: [], conn: null },
    // { id: 2, name: 'b', cards: [], points: [], declarations: [], conn: null },
    // { id: 3, name: 'c', cards: [], points: [], declarations: [], conn: null },
    // { id: 4, name: 'd', cards: [], points: [], declarations: [], conn: null },
    //
  ],

  /**
   * Holds scores of the games played so far.
   */
  score: [
    // [TeamA points, Team B points]
    // [20, 4], [5, 11],
  ],
};

// =============================================================================
// Declarations

/**
 * Check if player has 4 of kind.
 * @returns {Number} 1 if found, 0 if not.
 */
export const fourOfKindCheck = rank => player => (
  player.cards.filter(c => c.rank === rank).length === 4 ? 1 : 0
);

/**
 * Check if player has some amount of subsequent cards.
 * @param {Number} length The exact length of cards sub-sequence
 *                        we are searching for.
 * @param {Boolean} andBigger If `true` will match sub-sequences
 *                            with length >= `length`.
 * @returns {Number} The amount of sub-sequences found, that match
 *                   the provided criteria.
 */
export const subsequentRanksCheck = (length, andBigger = false) => player => {
  const cardsBySuite = player.cards.reduce((res, card) => {
    if (!res[card.suite]) res[card.suite] = [];
    res[card.suite].push(card);
    return res;
  }, {});

  return Object.keys(cardsBySuite).map(suite => {
    if (cardsBySuite[suite].length < length) {
      return 0;
    }

    return cardsBySuite[suite]
      .sort((a, b) => a.power - b.power)
      .filter((card, i, arr) => (
        // Keep only subsequent card by power.
        (arr[i + 1] !== undefined && card.power + 1 === arr[i + 1].power) ||
          (arr[i - 1] !== undefined && card.power - 1 === arr[i - 1].power)
      )).reduce((res, card) => {
        // Reduce to array of subsequent cards.
        const current = Math.max(res.length - 1, 0);
        if (!res[current]) {
          res[current] = [card];
        } else {
          const seq = res[current];
          const lastCard = seq[seq.length - 1];

          if (lastCard.power + 1 === card.power && lastCard.suite === card.suite) {
            seq.push(card);
          } else {
            res[current + 1] = [card];
          }
        }

        return res;
      }, []).filter(s => (
        // Keep only sub-sequences with desired length.
        andBigger ? s.length >= length : s.length === length
      )).length;
  }).reduce((a, b) => a + b);
};

export const DECLARATIONS = {
  fourA: {
    name: 'fourA',
    points: 100,
    check: fourOfKindCheck('A'),
  },

  fourK: {
    name: 'fourK',
    points: 100,
    check: fourOfKindCheck('K'),
  },

  fourQ: {
    name: 'fourQ',
    points: 100,
    check: fourOfKindCheck('Q'),
  },

  four10: {
    name: 'four10',
    points: 100,
    check: fourOfKindCheck('10'),
  },

  fourJ: {
    name: 'fourJ',
    points: 200,
    check: fourOfKindCheck('J'),
  },

  four9: {
    name: 'four9',
    points: 150,
    check: fourOfKindCheck('9'),
  },

  tierce: {
    name: 'tierce',
    points: 20,
    check: subsequentRanksCheck(3),
  },

  quarte: {
    name: 'quarte',
    points: 50,
    check: subsequentRanksCheck(4),
  },

  quinte: {
    name: 'quinte',
    points: 100,
    check: subsequentRanksCheck(5),
  },

  // NOTE: Belot is the only special declaration that is handled
  //       in the game loop.
  belot: {
    name: 'belot',
    points: 20,
    check: _ => 0,
  }
};

// =============================================================================
// Selectors
//
// Functions that accept `state` and select derivative information from it.
//
// TODO: `memoize` those?
//

export const SELECTORS = {
  /**
   * Returns one for Game state constants.
   * @returns {String} One of STATE values.
   */
  getState: state => {
    // All players passed.
    if (state.claims.map(c => c[1]).join('') === CLAIMS.PASS.repeat('4')) {
      return STATE.FINISHED;
    }

    // Players have no more cards.
    const remainingCards = state.players.reduce((res, p) => (
      res + p.cards.length
    ), 0);
    if (remainingCards === 0 && state.deck.length === 0) return STATE.FINISHED;

    // Somebody claimed something and we have 3 pass.
    if (state.claims.length > 3
        && state.claims.map(c => c[1]).slice(-3).join('')
        === CLAIMS.PASS.repeat('3')) {
      return STATE.PLAYING;
    }

    return STATE.CLAIMING;
  },

  /**
   * Get available declarations for the current player based on his cards.
   * @returns {Array} List of available declarations.
   */
  getDeclarations: state => {
    return Object.values(DECLARATIONS).map(d => (
      [...new Array(d.check(state.players[state.currentPlayer]))].map(_ => d)
    )).reduce((a, b) => a.concat(b));
  },

  /**
   * Get current game claim, multiplier and player who claimed.
   * @returns [suite, multiplier, player]
   */
  getCurrentClaim: state => {
    const claimedSuitesAndMultipliers = state.claims.slice()
          .reverse()
          .filter(c => c[1] !== CLAIMS.PASS);

    // If we have passes by now.
    if (claimedSuitesAndMultipliers.length === 0) {
      return [null, null];
    }

    const claimedSuite = claimedSuitesAndMultipliers.find(c => (
      c[1] !== CLAIMS.DOUBLE && c[1] !== CLAIMS.RE_DOUBLE
    ));
    const claimedMultiplier = claimedSuitesAndMultipliers[0] !== claimedSuite
          ? claimedSuitesAndMultipliers[0]
          : null;


    return [
      claimedSuite[1],
      claimedMultiplier && claimedMultiplier[1],
      claimedSuite[0]
    ];
  },

  /**
   * Get the list of available claims for the current player.
   * @returns {Array} List of possible claims.
   */
  getPossibleClaims: state => {
    if (SELECTORS.getState(state) !== STATE.CLAIMING) {
      throw new Error(`Claims are possible only in ${STATE.CLAIMING} state.`);
    }

    const [suite, multiplier] = SELECTORS.getCurrentClaim(state);

    if (suite === CLAIMS.PASS) {
      return Object.values(CLAIMS);
    }

    const possibleSuites = CLAIMS_ORDER.slice(CLAIMS_ORDER.indexOf(suite) + 1);
    const possibleMultipliers = multiplier === CLAIMS.DOUBLE
          ? [CLAIMS.RE_DOUBLE]
          : (multiplier ? [] : [CLAIMS.DOUBLE, CLAIMS.RE_DOUBLE]);

    return [...possibleSuites, ...possibleMultipliers];
  },

  /**
   * Get the list of cards that current player is able to play.
   * @returns {Array} List of possible cards.
   */
  getPossibleCards: state => {
    if (SELECTORS.getState(state) !== STATE.PLAYING) {
      throw new Error(`Playing cards is possible only in ${STATE.PLAYING} state.`);
    }

    const { currentPlayer, currentCards } = state;
    const [currentClaim] = SELECTORS.getCurrentClaim(state);
    const player = state.players[currentPlayer];

    // If no cards on the table, the player can play any card.
    if (currentCards.length === 0) {
      return player.cards;
    }

    const firstCardOnTheTable = currentCards[0];
    const mostPowerfulCardOnTheTable = currentCards
          .filter(c => c.suite === firstCardOnTheTable.suite)
          .sort((a, b) => b.allTrumpsPower - a.allTrumpsPower)
          .reverse()[0];

    const cardsFromSuite = player.cards.filter(c => (
      c.suite === firstCardOnTheTable.suite
    ));
    const cardsFromSuiteWithHihgerPower = cardsFromSuite.filter(c => (
      c.allTrumpsPower > mostPowerfulCardOnTheTable.allTrumpsPower
    ));

    const isMostPowerfulCardByATeammate = (() => {
      const currentCardsWithPlayers = currentCards
            .map((card, i) => ([
              card,
              state.players[currentPlayer - (i + 1)]
                || state.players[4 + currentPlayer - (i + 1)]
            ]));
      const p = currentCardsWithPlayers.find(([card]) => (
        card === mostPowerfulCardOnTheTable
      ))[1];

      return p === state.players[currentPlayer + 2]
        || p === state.players[currentPlayer - 2];
    });

    if (cardsFromSuiteWithHihgerPower.length > 0
        // If playing on trumps, the player should raise...
        && (
          currentClaim === firstCardOnTheTable.suite
            || currentClaim === CLAIMS.ALL_TRUMPS
        )
        // ... unless his teammate owns the most powerful card played yet.
        && !isMostPowerfulCardByATeammate()) {
      return cardsFromSuiteWithHihgerPower;
    }

    if (cardsFromSuite.length > 0) {
      return cardsFromSuite;
    }

    return player.cards;
  },

  /**
   * Get the winning card from the `state.currentCards`.
   * @returns {Object}
   */
  getWinningCard: state => {
    if (state.currentCards.length !== 4) {
      throw new Error(`There should be 4 cards on the table to finish current hand.`);
    }

    const { currentCards } = state;
    const [currentClaim] = SELECTORS.getCurrentClaim(state);

    const firstCard = currentCards[0];
    const cardsFromSuite = currentCards.filter(c => (
      c.suite === firstCard.suite
    ));

    // If we are asking from trumps, highest allTrumpsPower card wins.
    if (currentClaim === firstCard.suite
        || currentClaim === CLAIMS.ALL_TRUMPS) {
      return cardsFromSuite.slice().sort((a, b) => (
        b.allTrumpsPower - a.allTrumpsPower
      ))[0];
    }

    const highestPowerCard = cardsFromSuite.slice().sort((a, b) => (
      b.power - a.power
    ))[0];

    // If no trumps highest rank card from the asked suite wins.
    if (currentClaim === CLAIMS.NO_TRUMPS) {
      return highestPowerCard;
    }

    const highestPowerTrumpsCard = currentCards
          .filter(c => (
            c.suite === currentClaim
          ))
          .sort((a, b) => (
            b.allTrumpsPower - a.allTrumpsPower
          ))[0];

    // If playing on suite, highest trump or highest power card wins.
    return highestPowerTrumpsCard || highestPowerCard;
  },

  getFinalPoints: state => {
    const [
      currentClaim,
      currentMultiplier,
      playerWhoClaimed
    ] = SELECTORS.getCurrentClaim(state);
    const pointsFromDeclarations = state
          .players
          .map(p => p.declarations.reduce((res, item) => res + item.points, 0));

    const pointsFromCards = state
          .players
          .map(p => p.points.reduce((res, card) => (
            res +
              (currentClaim === card.suite || currentClaim === CLAIMS.ALL_TRUMPS
               ? card.allTrumpsPoints
               : card.points)
          ), 0));

    const points = pointsFromDeclarations.map((points, i) => (
      points + pointsFromCards[i]
    ));

    const teamAPoints = points[0] + points[2];
    const teamBPoints = points[1] + points[3];
    const isTeamAClaimed = playerWhoClaimed === 0 || playerWhoClaimed === 1;

    // TODO: Add description for `вътре` and `валат`.
    const getTotalScore = () => {
      if (currentMultiplier) {
        if (teamAPoints > teamBPoints) {
          return [teamAPoints + teamBPoints, 0];
        }

        if (teamAPoints < teamBPoints) {
          return [0, teamAPoints + teamBPoints];
        }

        return [teamAPoints, teamBPoints];
      }

      if (isTeamAClaimed) {
        if (teamAPoints >= teamBPoints) {
          return [teamAPoints, teamBPoints];
        }

        return [0, teamAPoints + teamBPoints];
      }

      if (teamAPoints >= teamBPoints) {
        return [teamAPoints + teamAPoints, 0];
      }

      return [teamAPoints, teamBPoints];
    };

    return {
      points: [teamAPoints, teamBPoints],
      result: getTotalScore(),
    };
  },
};

// =============================================================================
// Mutations
//
// Functions that accept `state` and return new (transitioned) `state` without
// mutating the original one.
//

const createPlayer = (id, name, conn) => ({
  id,
  name,
  conn,
  cards: [],
  points: [],
  declarations: [],
});

const nextPlayer = state => {
  if (state.currentPlayer === 3) {
    state.currentPlayer = 0;
  } else {
    state.currentPlayer += 1;
  }
};

const wrapImmer = f => (state, ...args) => (
  produce(state, draftState => f(draftState, ...args))
);

export const MUTATIONS = {
  /**
   * Reset `currentPlayer` to the original value before claims.
   */
  resetCurrentPlayer: wrapImmer(state => {
    state.currentPlayer = state.players.indexOf(
      state.players.find(p => p.id === state.claims[0][0])
    );
  }),

  addPrevPlayer: wrapImmer((state, ...args) => {
    state.players = [
      ...state.players.slice(0, -1),
      createPlayer(...args),
      ...state.players.slice(-1)
    ];
  }),

  addNextPlayer: wrapImmer((state, ...args) => {
    state.players.push(createPlayer(...args));
  }),

  /**
   * Hand out new cards to each player and sort his cards by power and suite.
   *
   * @param {Number} num Number of cards to hand out to each player.
   */
  handOutCards: wrapImmer((state, num) => {
    state.players.forEach(p => {
      p.cards.push(...state.deck.splice(0, num));

      const cardsBySuite = p.cards.reduce((res, card) => {
        if (!res[card.suite]) res[card.suite] = [];
        res[card.suite].push(card);
        return res;
      }, {});

      const res = [];
      Object.keys(cardsBySuite).forEach(suite => {
        res.push(...sortArrBy(cardsBySuite[suite], 'power'));
      });

      p.cards = res;
    });
  }),

  claim: wrapImmer((state, claim) => {
    if (!CLAIMS[claim] || !SELECTORS.getPossibleClaims(state).includes(claim)) {
      throw new Error(`Invalid claim: ${claim}`);
    }

    state.claims.push([state.players[state.currentPlayer].id, claim]);
    nextPlayer(state);
  }),

  declare: wrapImmer((state, declaration) => {
    state.players[state.currentPlayer].declarations.push(declaration);
  }),

  play: wrapImmer((state, card) => {
    const player = state.players[state.currentPlayer];

    state.currentCards.push(player.cards[card]);
    player.cards.splice(card, 1);
    nextPlayer(state);
  }),

  /**
   * Finish current hand when there are four cards on the table.
   */
  finishHand: wrapImmer(state => {
    if (state.currentCards.length !== 4) {
      throw new Error(`There should be 4 cards on the table to finish current hand.`);
    }

    const { currentPlayer, currentCards } = state;

    const winningCard = SELECTORS.getWinningCard(state);
    const winningCardOwner = (currentPlayer + currentCards.indexOf(winningCard)) % 4;

    state.players[winningCardOwner].points.push(...currentCards);
    state.currentCards = [];
    state.currentPlayer = winningCardOwner;
  }),

  /**
   * Finish current game when there are no cards left to play.
   */
  finishGame: wrapImmer((state, newDeck) => {
    if (SELECTORS.getState(state) !== STATE.FINISHED) {
      throw new Error(`Trying to finish game in state: ${SELECTORS.getState(state)}`);;
    }

    const gameScore = SELECTORS.getFinalPoints(state);
    state.score.push(gameScore.result);

    state.players.forEach(p => {
      p.cards = [];
      p.points = [];
      p.declarations = [];
    });
    state.claims = [];
    state.currentPlayer++;
    state.deck = newDeck;
  }),
};

// =============================================================================
// Game loop

const timeout = time => new Promise(resolve => setTimeout(resolve, time));

/**
 * Defines supported messages type for player input request-response
 * communication.
 */
export const GAME_REQUEST_PROTOCOL = {
  'PLAY': 'PLAY',
  'CLAIM': 'CLAIM',

  // Confirm something like declaration - tierce or belot.
  'CONFIRM': 'CONFIRM',

  // Used to create new deck after current game is finished.
  'GET_DECK': 'GET_DECK',
};

/**
 * Bridge-Belote game logic implementation using available SELECTORS and
 * MUTATIONS.
 *
 * @param {Object} defaultState
 * @param {Functions} message Interface to show messages.
 * @param {Functions} request Interface to request player input
 *                            according to GAME_REQUEST_PROTOCOL.
 * @param {Functions} render Interface to request render after
 *                           state transition.
 */
export async function gameLoop(defaultState, message, request, render) {
  let state = defaultState;

  while(true) {
    render(state);
    await timeout(1000 * 2);

    switch(SELECTORS.getState(state)) {

    case STATE.FINISHED: {
      const [suite] = SELECTORS.getCurrentClaim(state);

      if (!suite) {
        message('All players passed. Game finished.');
      } else {
        // TODO: Improve message.
        message(`Game finished with score: ${SELECTORS.getFinalPoints(state)}`);
      }

      const deck = await request(GAME_REQUEST_PROTOCOL.GET_DECK);
      state = MUTATIONS.finishGame(state, deck);

      // TODO: if score > 151 finish
      // return; // NOTE: end of game

      break;
    }

    case STATE.CLAIMING: {
      // Make sure players have enough cards before claiming.
      if (state.players[0].cards.length === 0) {
        state = MUTATIONS.handOutCards(state, 3);
        break;
      }

      if (state.players[0].cards.length === 3) {
        state = MUTATIONS.handOutCards(state, 2);
        break;
      }

      if (state.players[0].cards.length !== 5) {
        throw new Error('Each player should have 5 cards during claiming phase.');
      }

      const possibleClaims = SELECTORS.getPossibleClaims(state);
      const selectedClaim = await request(GAME_REQUEST_PROTOCOL.CLAIM);

      if(!possibleClaims.includes(selectedClaim)) {
        throw new Error(`Invalid claim selected: ${selectedClaim}`);
      }

      state = MUTATIONS.claim(state, selectedClaim);;

      break;
    }

    case STATE.PLAYING: {
      // Make sure players have enough cards before playing.
      if (state.deck.length !== 0) {
        state = MUTATIONS.handOutCards(state, 3);
        break;
      }

      // Is it the end of the current hand?
      if (state.currentCards.length === 4) {
        state = MUTATIONS.finishHand(state);
        break;
      }

      // Is it time for declarations?
      if (state.players.reduce((res, p) => res + p.points.length, 0) === 0) {
        const declarations = SELECTORS.getDeclarations(state);
        if (declarations.length) {
          for(let i = 0; i < declarations.length; i++) {
            const confirm = await request(GAME_REQUEST_PROTOCOL.CONFIRM, {
              declaration: {
                  ...declarations[i],

                // TODO: This message is serialized and we don't want
                //       functions in it.
                check: null
              }
            });

            if (confirm) {
              state = MUTATIONS.declare(state, declarations[i]);
            }
          }
        }
      }

      const player = state.players[state.currentPlayer];
      const possibleCards = SELECTORS.getPossibleCards(state);
      const cardResponse = await request(GAME_REQUEST_PROTOCOL.PLAY);
      const selectedCard = possibleCards[cardResponse];

      if(!selectedCard) {
        throw new Error(`Invalid card selected: ${selectedCard}`);
      }

      // Is it belot?
      if (selectedCard.rank === 'Q' || selectedCard.rank === 'K') {
        const additionRank = selectedCard.rank === 'Q' ? 'K' : 'Q';
        const additionCard = player.cards.find(c => (
          c.suite === selectedCard.suite && c.rank === additionRank
        ));

        if (additionCard) {
          const confirm = await request(GAME_REQUEST_PROTOCOL.CONFIRM, {
            belot: true
          });
          if (confirm) {
            state = MUTATIONS.declare(state, DECLARATIONS.belot);
          }
        }
      }

      state = MUTATIONS.play(
        state,
        player.cards.indexOf(selectedCard)
      );

      break;
    }

    default: {
      throw new Error('Invalid state');
    }
    }
  }
};
