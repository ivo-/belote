import React from 'react';
import {
  GAME_REQUEST_PROTOCOL,
  gameLoop,

  INITIAL_STATE,
  SELECTORS,
  MUTATIONS,

  getShuffledDeck,
} from './state';
import { t } from './translations';
import './App.css';

// TODO: TEST: Играй цяла игра + следващта врътка.
// TODO: Handle game is finished after 151

// TODO: Add chat.
// TODO: Handle the case when one user quits the game and we want
//       to replace it with other or just restart the game?
// TODO: Handle remove player, connection lost and so on.

export const PEERS_COMMUNICATION_PROTOCOL = {
  // Connect to some player.
  CONNECT: 'CONNECT',

  // Fulfill the current input.
  INPUT: 'INPUT',

  // Start the game.
  START: 'START',
};

/**
 * Due to the specifics of P2P communication you should think about this file
 * similarly as a program implemented using `fork`.
 *
 * 1. Every player constructs its own <App> and connects to PeerJS cloud.
 * 2. One player starts adding others by id (connects to others).
 * 3. This player now "owns" the game and has true for `isCurrentPlayerGameOwner`
 *    flag, while the same flag is false for others.
 * 4. When game owner connects to a player, he makes all the other players
 *    connect to the new player.
 * 5. When we have 4 players, state between all of them is synced and the
 *    game can begin.
 * 6. Every player has its own `gameLoop` running and answers to requests only
 *    when its his turn.
 * 7. When player answers to a request, the answer is broadcasted to
 *    all the players in order for their game loops to continue as well.
 */
class App extends React.Component {
  constructor(props) {
    super(props);

    // Refs
    this.tableRef = React.createRef();

    // State
    this.state = {
      // The player who plays the game in this APP instance.
      playerId: null,
      playerName: null,

      // Game state.
      gameState: INITIAL_STATE,

      // Indicates whether the game is currently running.
      gameStarted: false,

      // Indicates whether we are waiting for an input -> user
      // to claim suite or user to play card?
      inputRequested: false,

      // Is current player the one who owns the game?
      isCurrentPlayerGameOwner: true,
    };

    this._initPeer();
  }

  /**
   * Connect current player to Peerjs cloud.
   */
  _initPeer() {
    this.peer = new window.Peer();

    this.peer.on('open', id => {
      this.setState({ playerId: id });
    });

    this.peer.on('connection', conn => {
      const { gameState } = this.state;
      this.setState({
        isCurrentPlayerGameOwner: false,
        gameState: MUTATIONS.addPrevPlayer(
          gameState,
          conn.peer,
          conn.metadata.name,
          conn
        )
      });

      conn.on('open', () => {
        conn.on('data', this.handleMessagesFromOtherPeers);

        // NOTE: When player A connects to player B by ID,
        //       player B should send player A its name.
        conn.send(this.state.playerName);
      });

      // TODO: Remove player.
      // conn.on('close', () => {});
    });
  }

  isCurrentPlayerTurn = () => {
    const { gameState } = this.state;
    const playerOnTurn = gameState.players[gameState.currentPlayer];
    return playerOnTurn.id === this.state.playerId;
  };

  scaleTable = () => {
    const table = this.tableRef.current;

    if (!table) return;

    const side = 752;
    const browserWidth = window.innerWidth;
    const browserHeight = window.innerHeight;

    let scale;
    if (browserHeight < browserWidth) {
      scale = 1 - (side - browserHeight)/side;
    } else {
      scale = 1 - (side - browserWidth)/side;
    }

    if (this.lastScale === scale) return;
    this.lastScale = scale;

    table.style.zoom = scale.toFixed(3);
  }

  componentDidMount() {
    window.addEventListener('resize', this.scaleTable);
    this.scaleTable();

    // TODO:
    // Prevent accidental tab closes.
    // window.addEventListener('beforeunload', e => {
    //   e.preventDefault();
    //   e.returnValue = '';
    // });
  }

  componentDidUpdate() {
    this.scaleTable();
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this.scaleTable);
  }

  // ===========================================================================
  // Handlers

  handleMessagesFromOtherPeers = data => {
    // DEBUG:
    //
    console.log('Message received: ', data);
    //

    switch(data.type) {
    case PEERS_COMMUNICATION_PROTOCOL.CONNECT: {
      const conn = this.peer.connect(data.player.id, {
        metadata: {
          name: this.state.playerName
        }
      });

      conn.on('open', () => {
        conn.once('data', () => {
          // NOTE: Ignore first message, because we already know
          //       the player name.
          conn.on('data', this.handleMessagesFromOtherPeers);
        });

        this.setState({
          gameState: MUTATIONS.addNextPlayer(
            this.state.gameState,
            data.player.id,
            data.player.name,
            conn
          ),
        });
      });
      return;
    }

    case PEERS_COMMUNICATION_PROTOCOL.INPUT: {
      const { result, request } = data;
      if (request.action === GAME_REQUEST_PROTOCOL.CONFIRM) {
        let message = `${request.player} декларира`;
        if (request.data.declaration) {
          message = `${message} ${t(request.data.declaration.name)}!`;
        } else if (request.data.belot) {
          message = `${message} ${t('belot')}!`;
        }

        alert(message);
      }

      this._onInputRequest(result);
      return;
    }

    case PEERS_COMMUNICATION_PROTOCOL.START: {
      this.setState({
        gameState: {
          ...this.state.gameState,
          deck: data.deck,
        }
      });

      this.handleStartGame();
      return;
    }

    default: throw new Error(`Bad peer message: ${data}`);
    }
  };

  /**
   * Handles requests for data input as described in
   * GAME_REQUEST_PROTOCOL. Requests are either completed and broadcasted
   * by the current player or ignored and handled by other player.
   */
  handleRequestInput = (action, data) => {
    if(this.state.inputRequested) {
      throw new Error(`Input is already requested`);
    }

    if (!GAME_REQUEST_PROTOCOL[action]) {
      throw new Error(`Unknown action: ${action}`);
    }

    this.setState({ inputRequested: { action, data } });

    return new Promise((resolve, reject) => {
      this._onInputRequest = (result, broadcast = false) => {
        this._onInputRequest = null;

        this.setState({ inputRequested: false }, () => {
          resolve(result);
        });

        // Broadcast the response to other peers. Only requests handled
        // by current player should be broadcasted.
        if (broadcast) {
          this.state.gameState.players.forEach(p => {
            if (!p.conn) return;
            p.conn.send({
              type: PEERS_COMMUNICATION_PROTOCOL.INPUT,
              result,
              request: {
                data,
                action,
                player: this.state.playerName
              }
            });
          });
        }
      };
    });
  };

  /**
   * Start game loop. At this point all the players should have
   * the same state.
   */
  handleStartGame = () => {
    if (this.state.gameStarted) {
      throw new Error('Game already started');
    }

    this.setState({ gameStarted: true });

    // TODO: Handle game finish and errors.
    gameLoop(
      this.state.gameState,
      alert, // TODO: Do a better messages interface.
      this.handleRequestInput.bind(this),
      gameState => this.setState({ gameState })
    );

    if (!this.state.isCurrentPlayerGameOwner) return;

    const { gameState } = this.state;
    gameState.players.forEach(p => {
      if (!p.conn) return;
      p.conn.send({
        type: PEERS_COMMUNICATION_PROTOCOL.START,
        deck: gameState.deck,
      });
    });
  };

  handleConnectToPlayer = newPlayerId => {
    const newPlayerConn = this.peer.connect(newPlayerId, {
      metadata: {
        name: this.state.playerName
      }
    });

    newPlayerConn.on('open', () => {
      newPlayerConn.once('data', newPlayerName => {
        const { gameState } = this.state;
        // Every new connection is broadcasted to all the
        // available connections.
        gameState.players.forEach(p => {
          if (!p.conn) return;

          p.conn.send({
            type: PEERS_COMMUNICATION_PROTOCOL.CONNECT,
            player: {
              id: newPlayerId,
              name: newPlayerName,
            }
          });
        });

        newPlayerConn.on('data', this.handleMessagesFromOtherPeers);
        this.setState({
          gameState: MUTATIONS.addNextPlayer(
            gameState,
            newPlayerId,
            newPlayerName,
            newPlayerConn
          ),
        });
      });
    });
  };

  handleCardClick = (card, player) => {
    if (!this._onInputRequest) return;

    const { gameState } = this.state;
    const playerOnTurn = gameState.players[gameState.currentPlayer];

    if (playerOnTurn.id !== player.id) return;
    if (!this.isCurrentPlayerTurn()) return;

    const possibleCards = SELECTORS.getPossibleCards(this.state.gameState);
    const selectedCardIndex = possibleCards.indexOf(card);

    this._onInputRequest(selectedCardIndex, true);
  };

  // ===========================================================================
  // Rendering

  renderAddUsersPopup(id) {
    const { playerName, playerId } = this.state;

    if(!playerId) {
      return (
        <section className="App-add-users-popup">
          <h3>Свързване...</h3>
        </section>
      );
    }

    if (!playerName) {
      return (
        <section className="App-add-users-popup">
          <h3>Изберете си име</h3>
          <input type="text" placeholder="Вашето име" />
          <button onClick={e => {
            // This is rendered only once, so leave the handle inline.
            const playerName = e.target.parentNode.querySelector('input').value.trim();
            if (!playerName) return;
            this.setState({
              playerName,
              gameState: MUTATIONS.addNextPlayer(
                this.state.gameState,
                playerId,
                playerName
              )
            });
          }}>Запази</button>
        </section>
      );
    }

    return (
      <section className="App-add-users-popup">
        <h3>Нужни са 4 човека, за да започнете игра :)</h3>
        { this.state.gameState.players.length === 1 &&
          <h5>Пратете вашия идентификатор на приятел или добавете идентификатора на приятел в полето по-долу.</h5>
        }
        <ul>
          {this.state.gameState.players.map(p => (
            <li key={p.id}>
              <u>{p.name}</u> ({p.id})
            </li>
          ))}
        </ul>
        {this.state.isCurrentPlayerGameOwner ?
         <React.Fragment>
           { this.state.gameState.players.length !== 4 &&
             <React.Fragment>
               <input type="text"
                      placeholder="Идентификатор на приятел"
               />
               <button onClick={e => {
                 // This is rendered only once, so leave the handle inline.
                 const input = e.target.parentNode.querySelector('input');
                 const newPlayerId = input.value.trim();
                 input.value = '';

                 if (!newPlayerId) return;
                 this.handleConnectToPlayer(newPlayerId);
               }}>Добави</button>
             </React.Fragment>
           }
           <button disabled={this.state.gameState.players.length !== 4}
                   onClick={this.handleStartGame}>
             Започни играта
           </button>
         </React.Fragment>
         : 'Изчакайте да се стартира играта!'
        }
      </section>
    );
  }

  renderInputPopup() {
    if (!this.state.inputRequested) return null;

    if (!this.isCurrentPlayerTurn()) {
      // Waiting for some of the other players to respond.
      return null;
    }

    const { action, data } = this.state.inputRequested;
    let body = null;

    switch(action) {
    case GAME_REQUEST_PROTOCOL.CLAIM:
      const possibleClaims = SELECTORS.getPossibleClaims(this.state.gameState);

      body = (
        <div>
          {possibleClaims.map(claim => (
            <button key={claim} onClick={() => this._onInputRequest(claim, true)}>
              {t(claim)}
            </button>
          ))}
        </div>
      );
      break;

    case GAME_REQUEST_PROTOCOL.PLAY:
      break; // Handled by clicking a card.

    case GAME_REQUEST_PROTOCOL.CONFIRM:
      let message = t('wanna_declare');
      if (data.declaration) {
        message = `${message} ${t(data.declaration.name)}?`;
      } else if (data.belot) {
        message = `${message} ${t('belot')}?`;
      }

      body = (
        <div>
          {message}
          <button onClick={() => this._onInputRequest(true, true)}>
            {t('yes')}
          </button>
          <button onClick={() => this._onInputRequest(false, true)}>
            {t('no')}
          </button>
        </div>
      );
      break;

    case GAME_REQUEST_PROTOCOL.GET_DECK:
      if (this.state.isCurrentPlayerGameOwner) {
        setTimeout(() => {
          this._onInputRequest(getShuffledDeck(), true);
        }, 1000 * 2);
      }

      body = 'Тестето с карти се разбърква...';
      break;

    default:
      throw new Error(`Unknown action: ${action}`);
    }

    return body && (
      <div className="App-popup">
        {body}
      </div>
    );
  }

  renderCard(card, player = null) {
    const { inputRequested } = this.state;

    let extraClass = 'possible';
    if (inputRequested.action === GAME_REQUEST_PROTOCOL.PLAY) {
      const { gameState } = this.state;
      const possibleCards = SELECTORS.getPossibleCards(this.state.gameState);
      if (player
          && player.id === gameState.players[gameState.currentPlayer].id
          && !possibleCards.includes(card)
         ) {
        extraClass = 'not-possible';
      }
    }

    return (
      <div key={card.rank + card.suite}
           onClick={() => player && this.handleCardClick(card, player)}
           className={`card ${player && player.id === this.state.playerId
             ? `${card.suite.toLowerCase()}_${card.rank} ${extraClass}`
             : 'placeholder'
           }`}
      />
    );
  }

  renderCurrentHand() {
    return (
      <section className="App-current-hand ">
        {this.state.gameState.currentCards.map(card => (
          <div key={card.rank + card.suite}
               className={`card ${card.suite.toLowerCase()}_${card.rank}`}
          />
        ))}
      </section>
    );
  }

  renderPlayer(player, position) {
    const { gameState } = this.state;
    const playerOnTurn = gameState.players[gameState.currentPlayer];

    return (
      <section key={player.id} className={`App-player ${position}`}>
        <div>
          {player.cards.map(card => this.renderCard(card, player))}
        </div>
        <div className={`App-player-name ${playerOnTurn === player ? 'current' : ''}`}>
          {player.name}
        </div>
      </section>
    );
  }

  render() {
    const { gameState, gameStarted } = this.state;
    if (!gameStarted) {
      return this.renderAddUsersPopup();
    }

    const [claim, multiplier, byPlayer] = SELECTORS.getCurrentClaim(gameState);
    const score = gameState.score.reduce((res, [a, b]) => ([
      res[0] + a,
      res[1] + b,
    ]), [0, 0]);
    const whatIsClaimed = claim
          ? `${t(claim)} ${multiplier ? t(multiplier) : ''}`
          :'---';
    const whoClaimedIt = claim
          ? gameState.players.find(p => p.id === byPlayer).name
          : '---';

    const positions = ['bottom', 'right', 'top', 'left'];
    return (
      <div className="App">
        <section className="App-table" ref={this.tableRef}>
          <header className="App-score">
            <u>Ние</u> <br />{score[0]} <br />
            <u>Вие</u> <br />{score[1]}
          </header>
          <header className="App-info">
            <u>Обявено:</u> <br />{whatIsClaimed} <br />
            <u>Обявил:</u> <br /> {whoClaimedIt}
          </header>
          {this.state.gameState.players.map((player, i) => (
            this.renderPlayer(player, positions[i])
          ))}
          {this.renderCurrentHand()}
          {this.renderInputPopup()}
        </section>
      </div>
    );
  }
}

export default App;
