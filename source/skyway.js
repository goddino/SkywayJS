/**
 *
 * @class Skyway
 */
(function () {

  /**
   * @class Skyway
   * @constructor
   * @param {String} serverpath Path to the server to collect infos from.
   *                            Ex: https://wwwindow.webrtc-enterprise.com:8080
   * @param {String} apikey     Owner of the room. Ex: MomentMedia.
   * @param {string} [room]     Name of the room to join. Default room is used if null.
   */
  function Skyway() {
    if (!(this instanceof Skyway)) {
      return new Skyway();
    }

    this.VERSION = '@@version';

    // NOTE ALEX: check if last char is '/'
    /**
     * @attribute _path
     * @type String
     * @default serverpath
     * @final
     * @required
     * @private
     */
    this._path = null;

    /**
     * The API key (not used)
     * @attribute key
     * @type String
     * @private
     */
    this._key = null;
    /**
     * the actual socket that handle the connection
     *
     * @attribute _socket
     * @required
     * @private
     */
    this._socket = null;
    /**
     * User Information, credential and the local stream(s).
     * @attribute _user
     * @required
     * @private
     *
     */
    this._user = null;
    /**
     * @attribute _room
     * @type JSON
     * @required
     * @private
     *
     * @param {} room  Room Information, and credentials.
     * @param {String} room.id
     * @param {String} room.token
     * @param {String} room.tokenTimestamp
     * @param {String} room.displayName Displayed name
     * @param {JSON} room.signalingServer
     * @param {String} room.signalingServer.ip
     * @param {String} room.signalingServer.port
     * @param {JSON} room.pcHelper Holder for all the constraints objects used
     *   in a peerconnection lifetime. Some are initialized by default, some are initialized by
     *   internal methods, all can be overriden through updateUser. Future APIs will help user
     * modifying specific parts (audio only, video only, ...) separately without knowing the
     * intricacies of constraints.
     * @param {JSON} room.pcHelper.pcConstraints
     * @param {JSON} room.pcHelper.pcConfig Will be provided upon connection to a room
     * @param {JSON}  [room.pcHelper.pcConfig.mandatory]
     * @param {Array} [room.pcHelper.pcConfig.optional]
     *   Ex: [{DtlsSrtpKeyAgreement: true}]
     * @param {JSON} room.pcHelper.offerConstraints
     * @param {JSON} [room.pcHelper.offerConstraints.mandatory]
     *   Ex: {MozDontOfferDataChannel:true}
     * @param {Array} [room.pcHelper.offerConstraints.optional]
     * @param {JSON} room.pcHelper.sdpConstraints
     * @param {JSON} [room.pcHelper.sdpConstraints.mandatory]
     *   Ex: { 'OfferToReceiveAudio':true, 'OfferToReceiveVideo':true }
     * @param {Array} [room.pcHelper.sdpConstraints.optional]
     */
    this._room = null;

    /**
     * Internal array of peerconnections
     * @attribute _peerConnections
     * @attribute
     * @private
     * @required
     */
    this._peerConnections = [];
    this._browser = null;
    this._readyState = 0; // 0 'false or failed', 1 'in process', 2 'done'
    this._channel_open = false;
    this._in_room = false;
    this._dataTransfers = {};

    var _parseInfo = function (info, self) {
      self._key = info.cid;
      self._user = {
        id : info.username,
        token : info.userCred,
        tokenTimestamp : info.tokenTempCreated,
        displayName : info.displayName,
        streams : []
      };
      self._room = {
        id : info.room_key,
        token : info.roomCred,
        tokenTimestamp : info.timeStamp,
        signalingServer : {
          ip : info.ipSigserver,
          port : info.portSigserver
        },
        pcHelper : {
          pcConstraints : JSON.parse(info.pc_constraints),
          pcConfig : null,
          offerConstraints : JSON.parse(info.offer_constraints),
          sdpConstraints : {
            mandatory : {
              OfferToReceiveAudio : true,
              OfferToReceiveVideo : true
            }
          }
        }
      };
      console.log('API - Parsed infos from webserver. Ready.');
      self._readyState = 2;
      self._trigger('readyStateChange', 2);
    };

    this._init = function (self) {
      if (!window.XMLHttpRequest) {
        console.log('XHR - XMLHttpRequest not supported');
        return;
      }
      if (!window.RTCPeerConnection) {
        console.log('RTC - WebRTC not supported.');
        return;
      }
      if (!window.io) {
        console.log('API - Socket.io is not loaded.');
        return;
      }
      if (!this._path) {
        console.log('API - No connection info. Call init() first.');
        return;
      }

      self._readyState = 1;
      self._trigger('readyStateChange', 1);

      var xhr = new window.XMLHttpRequest();
      xhr.onreadystatechange = function () {
        if (this.readyState === this.DONE) {
          if (this.status !== 200) {
            console.log('XHR - ERROR ' + this.status, false);
            self._readyState = 0;
            self._trigger('readyStateChange', 0);
            return;
          }
          console.log('API - Got infos from webserver.');
          _parseInfo(JSON.parse(this.response), self);
        }
      };
      xhr.open('GET', self._path, true);
      console.log('API - Fetching infos from webserver');
      xhr.send();
      console.log('API - Waiting for webserver to provide infos.');
    };
  }

  this.Skyway = Skyway;

  /**
   * Let app register a callback function to an event
   *
   * @method on
   * @param {String} eventName
   * @param {Function} callback
   */
  Skyway.prototype.on = function (eventName, callback) {
    if ('function' === typeof callback) {
      this._events[eventName] = this._events[eventName] || [];
      this._events[eventName].push(callback);
    }
  };

  /**
   * Let app unregister a callback function from an event
   *
   * @method off
   * @param {String} eventName
   * @param {Function} callback
   */
  Skyway.prototype.off = function (eventName, callback) {
    if (callback === undefined) {
      this._events[eventName] = [];
      return;
    }
    var arr = this._events[eventName],
    l = arr.length,
    e = false;
    for (var i = 0; i < l; i++) {
      if (arr[i] === callback) {
        arr.splice(i, 1);
        break;
      }
    }
  };

  /**
   * Trigger all the callbacks associated with an event
   * Note that extra arguments can be passed to the callback
   * which extra argument can be expected by callback is documented by each event
   *
   * @method trigger
   * @param {String} eventName
   * @for Skyway
   * @private
   */
  Skyway.prototype._trigger = function (eventName) {
    var args = Array.prototype.slice.call(arguments),
    arr = this._events[eventName];
    args.shift();
    for (var e in arr) {
      if (arr[e].apply(this, args) === false) {
        break;
      }
    }
  };

  /**
   * @method init
   * @param {String} server Path to the Temasys backend server
   * @param {String} apikey API key to identify with the Temasys backend server
   * @param {String} room Room to enter
   */
  Skyway.prototype.init = function (server, apikey, room) {
    this._readyState = 0;
    this._trigger('readyStateChange', 0);
    this._key = apikey;
    this._path = server + apikey + '/room/' + (room ? room : apikey) + '?client=native';
    this._init(this);
  };

  /**
   * @method setUser
   * @param {} user
   * @param {String} user.id username in the system, will be 'Guestxxxxx' if not logged in
   * @param {String} user.token Token for user verification upon connection
   * @param {String} user.tokenTimestamp Token timestamp for connection validation.
   * @param {String} user.displayName Displayed name
   * @param {Array}  user.streams List of all the local streams. Can ge generated internally
   *                              by getDefaultStream(), or provided through updateUser().
   */
  Skyway.prototype.setUser = function (user) {
    // NOTE ALEX: be smarter and copy fields and only if different
    this._user = user;
  };

  /* Syntactically private variables and utility functions */

  Skyway.prototype._events = {
    /**
     * Event fired when a successfull connection channel has been established
     * with the signaling server
     * @event channelOpen
     */
    'channelOpen' : [],
    /**
     * Event fired when the channel has been closed.
     * @event channelClose
     */
    'channelClose' : [],
    /**
     * Event fired when we received a message from the sig server..
     * @event channelMessage
     */
    'channelMessage' : [],
    /**
     * Event fired when there was an error with the connection channel to the sig server.
     * @event channelError
     */
    'channelError' : [],

    /**
     * @event joinedRoom
     */
    'joinedRoom' : [],
    /**
     *
     * @event readyStateChange
     * @param {String} readyState
     */
    'readyStateChange' : [],
    /**
     * Event fired when a step of the handshake has happened. Usefull for diagnostic
     * or progress bar.
     * @event handshakeProgress
     * @param {String} step In order the steps of the handshake are: 'enter', 'welcome',
     *                 'offer', 'answer'
     */
    'handshakeProgress' : [],

    /**
     * Event fired during ICE gathering
     * @event candidateGenerationState
     * @param {String} 'gathering' 'done'
     */
    'candidateGenerationState' : [],

    'peerConnectionState' : [],
    /**
     * Event fired during ICE connection
     * @iceConnectionState
     * @param {String} 'new' 'closed' 'failed' 'checking' 'disconnected' 'connected'
     *   'completed'
     */
    'iceConnectionState' : [],

    //-- per peer, local media events
    /**
     * @event mediaAccessError
     */
    'mediaAccessError' : [],
    /**
     * @event mediaAccessSuccess
     * @param {} stream
     */
    'mediaAccessSuccess' : [],

    /**
     * @event chatMessage
     * @param {String}  msg
     * @param {String}  displayName
     * @param {Boolean} pvt
     */
    'chatMessage' : [],
    /**
     * Event fired when a peer joins the room
     * @event peerJoined
     * @param {String} peerID
     */
    'peerJoined' : [],
    /**
     * TODO Event fired when a peer leaves the room
     * @event peerLeft
     * @param {String} peerID
     */
    'peerLeft' : [],
    /**
     * TODO Event fired when a peer joins the room
     * @event peerLeft
     * @param {JSON} List of users
     */
    'presenceChanged' : [],
    /**
     * TODO
     *
     */
    'roomLock' : [],

    //-- per peer, peer connection events
    /**
     * Event fired when a remote stream has become available
     * @event addPeerStream
     * @param {String} peerID peerID
     * @param {} stream
     */
    'addPeerStream' : [],
    /**
     * Event fired when a remote stream has become unavailable
     * @event removePeerStream
     * @param {String} peerID peerID
     */
    'removePeerStream' : [],
    /**
     * TODO
     *
     */
    'peerVideoMute' : [],
    /**
     * TODO
     *
     */
    'peerAudioMute' : [],

    //-- per user events
    /**
     * TODO
     *
     */
    'addContact' : [],
    /**
     * TODO
     *
     */
    'removeContact' : [],
    /**
     * TODO
     *
     */
    'invitePeer' : []
  };

  /**
   * Send a chat message
   * @method sendChatMsg
   * @param {JSON}   chatMsg
   * @param {String} chatMsg.msg
   * @param {String} [targetPeerID]
   */
  Skyway.prototype.sendChatMsg = function (chatMsg, targetPeerID) {
    var msg_json = {
      cid : this._key,
      data : chatMsg,
      mid : this._user.id,
      nick : this._user.displayName,
      rid : this._room.id,
      type : 'chat'
    };
    if (targetPeerID) {
      msg_json.target = targetPeerID;
    }
    this._sendMessage(msg_json);
    this._trigger('chatMessage',
      chatMsg,
      this._user.displayName,
      !!targetPeerID);
  };

  /**
   * Get the default cam and microphone
   * @method getDefaultStream
   */
  Skyway.prototype.getDefaultStream = function () {
    var self = this;
    try {
      window.getUserMedia({
        'audio' : true,
        'video' : true
      }, function (s) {
        self._onUserMediaSuccess(s, self);
      }, function (e) {
        self._onUserMediaError(e, self);
      });
      console.log('API - Requested: A/V.');
    } catch (e) {
      this._onUserMediaError(e, self);
    }
  };

  /**
   * Stream is available, let's throw the corresponding event with the stream attached.
   *
   * @method getDefaultStreama
   * @param {} stream The acquired stream
   * @param {} t      A convenience pointer to the Skyway object for callbacks
   * @private
   */
  Skyway.prototype._onUserMediaSuccess = function (stream, t) {
    console.log('API - User has granted access to local media.');
    t._trigger('mediaAccessSuccess', stream);
    t._user.streams.push(stream);
  };

  /**
   * getUserMedia could not succeed.
   *
   * @method _onUserMediaError
   * @param {} e error
   * @param {} t A convenience pointer to the Skyway object for callbacks
   * @private
   */
  Skyway.prototype._onUserMediaError = function (e, t) {
    console.log('API - getUserMedia failed with exception type: ' + e.name);
    if (e.message) {
      console.log('API - getUserMedia failed with exception: ' + e.message);
    }
    if (e.constraintName) {
      console.log('API - getUserMedia failed because of the following constraint: ' +
        e.constraintName);
    }
    t._trigger('mediaAccessError', e.name);
  };

  /**
   * Handle every incoming message. If it's a bundle, extract single messages
   * Eventually handle the message(s) to _processSingleMsg
   *
   * @method _processingSigMsg
   * @param {JSON} message
   * @private
   */
  Skyway.prototype._processSigMsg = function (message) {
    var msg = JSON.parse(message);
    if (msg.type === 'group') {
      console.log('API - Bundle of ' + msg.lists.length + ' messages.');
      for (var i = 0; i < msg.lists.length; i++) {
        this._processSingleMsg(msg.lists[i]);
      }
    } else {
      this._processSingleMsg(msg);
    }
  };

  /**
   * This dispatch all the messages from the infrastructure to their respective handler
   *
   * @method _processingSingleMsg
   * @param {JSON str} msg
   * @private
   */
  Skyway.prototype._processSingleMsg = function (msg) {
    this._trigger('channelMessage');
    var origin = msg.mid;
    if (!origin || origin === this._user.id) {
      origin = 'Server';
    }
    console.log('API - [' + origin + '] Incoming message: ' + msg.type);
    if (msg.mid === this._user.id &&
      msg.type !== 'redirect' &&
      msg.type !== 'inRoom' &&
      msg.type !== 'chat') {
      console.log('API - Ignoring message: ' + msg.type + '.');
      return;
    }
    switch (msg.type) {
      //--- BASIC API Msgs ----
    case 'inRoom':
      this._inRoomHandler(msg);
      break;
    case 'enter':
      this._enterHandler(msg);
      break;
    case 'welcome':
      this._welcomeHandler(msg);
      break;
    case 'offer':
      this._offerHandler(msg);
      break;
    case 'answer':
      this._answerHandler(msg);
      break;
    case 'candidate':
      this._candidateHandler(msg);
      break;
    case 'bye':
      this._byeHandler(msg);
      break;
    case 'chat':
      this._chatHandler(msg);
      break;
    case 'redirect':
      this._redirectHandler(msg);
      break;
    case 'update_guest_name':
      // this._updateGuestNameHandler(msg);
      break;
    case 'error':
      // location.href = '/?error=' + msg.kind;
      break;
      //--- ADVANCED API Msgs ----
    case 'invite':
      // this._inviteHandler();
      break;
    case 'video_mute_event':
      // this._handleVideoMuteEventMessage(msg.mid, msg.guest);
      break;
    case 'roomLockEvent':
      // this._roomLockEventHandler(msg);
      break;
    default:
      console.log('API - [' + msg.mid + '] Unsupported message type received: ' + msg.type);
      break;
    }

  };

  /**
   * Throw an event with the received chat msg
   *
   * @method _chatHandler
   * @private
   * @param {JSON} msg
   * @param {String} msg.data
   * @param {String} msg.nick
   */
  Skyway.prototype._chatHandler = function (msg) {
    this._trigger('chatMessage',
      msg.data,
      ((msg.id === this._user.id) ? 'Me, myself and I' : msg.nick),
      (msg.target ? true : false));
  };

  /**
   * Signaller server wants us to move out.
   *
   * @method _redirectHandler
   * @private
   * @param {JSON} msg
   */
  Skyway.prototype._redirectHandler = function (msg) {
    console.log('API - [Server] You are being redirected: ' + msg.info);
    if (msg.action === 'warning') {
      return;
    } else if (msg.action === 'reject') {
      location.href = msg.url;
    } else if (msg.action === 'close') {
      location.href = msg.url;
    }
  };

  /**
   * A peer left, let.s clean the corresponding connection, and trigger an event.
   *
   * @method _byeHandler
   * @private
   * @param {JSON} msg
   */
  Skyway.prototype._byeHandler = function (msg) {
    var targetMid = msg.mid;
    console.log('API - [' + targetMid + '] received \'bye\'.');
    this._removePeer(targetMid);
  };

  /**
   * Actually clean the peerconnection and trigger an event. Can be called by _byHandler
   * and leaveRoom.
   *
   * @method _removePeer
   * @private
   * @param {String} peerID Id of the peer to remove
   */
  Skyway.prototype._removePeer = function (peerID) {
    this._trigger('peerLeft', peerID);
    if (this._peerConnections[peerID]) {
      this._peerConnections[peerID].close();
    }
    delete this._peerConnections[peerID];
  };

  /**
   * We just joined a room! Let's send a nice message to all to let them know I'm in.
   *
   * @method _inRoomHandler
   * @private
   * @param {JSON} msg
   */
  Skyway.prototype._inRoomHandler = function (msg) {
    console.log('API - We\'re in the room! Chat functionalities are now available.');
    console.log('API - We\'ve been given the following PC Constraint by the sig server: ');
    console.dir(msg.pc_config);

    // NOTE ALEX: make a separate function of this.
    var temp_config = msg.pc_config;
    if (window.webrtcDetectedBrowser.mozWebRTC) {
      // NOTE ALEX: shoul dbe given by the server
      var newIceServers = [{
          'url' : 'stun:stun.services.mozilla.com'
        }
      ];
      for (var i = 0; i < msg.pc_config.iceServers.length; i++) {
        var iceServer = msg.pc_config.iceServers[i];
        var iceServerType = iceServer.url.split(':')[0];
        if (iceServerType === 'stun') {
          if (iceServer.url.indexOf('google')) {
            continue;
          }
          iceServer.url = [iceServer.url];
          newIceServers.push(iceServer);
        } else {
          var newIceServer = {};
          newIceServer.credential = iceServer.credential;
          newIceServer.url = iceServer.url.split(':')[0];
          newIceServer.username = iceServer.url.split(':')[1].split('@')[0];
          newIceServer.url += ':' + iceServer.url.split(':')[1].split('@')[1];
          newIceServers.push(newIceServer);
        }
      }
      temp_config.iceServers = newIceServers;
    }
    console.dir(temp_config);

    this._room.pcHelper.pcConfig = temp_config;
    this._in_room = true;
    this._trigger('joinedRoom', this._room.id);

    // NOTE ALEX: should we wait for local streams?
    // or just go with what we have (if no stream, then one way?)
    // do we hardcode the logic here, or give the flexibility?
    // It would be better to separate, do we could choose with whom
    // we want to communicate, instead of connecting automatically to all.
    console.log('API - Sending enter.');
    this._trigger('handshakeProgress', 'enter');
    this._sendMessage({
      type : 'enter',
      mid : this._user.id,
      rid : this._room.id,
      nick : this._user.displayName
    });
  };

  /**
   * Someone just entered the room. If we don't have a connection with him/her,
   * send him a welcome. Handshake step 2 and 3.
   *
   * @method _enterHandler
   * @private
   * @param {JSON} msg
   */
  Skyway.prototype._enterHandler = function (msg) {
    var targetMid = msg.mid;
    this._trigger('handshakeProgress', 'enter', targetMid);
    this._trigger('peerJoined', targetMid);
    // need to check entered user is new or not.
    if (!this._peerConnections[targetMid]) {
      console.log('API - [' + targetMid + '] Sending welcome.');
      this._trigger('handshakeProgress', 'welcome', targetMid);
      this._sendMessage({
        type : 'welcome',
        mid : this._user.id,
        target : targetMid,
        rid : this._room.id,
        nick : this._user.displayName
      });
    } else {
      // NOTE ALEX: and if we already have a connection when the peer enter,
      // what should we do? what are the possible use case?
      return;
    }
  };

  /**
   * We have just received a welcome. If there is no existing connection with this peer,
   * create one, then set the remotedescription and answer.
   *
   * @method _offerHandler
   * @private
   * @param {JSON} msg
   */
  Skyway.prototype._welcomeHandler = function (msg) {
    var targetMid = msg.mid;
    this._trigger('handshakeProgress', 'welcome', targetMid);
    this._trigger('peerJoined', targetMid);
    if (!this._peerConnections[targetMid]) {
      this._openPeer(targetMid, true);
    }
  };

  /**
   * We have just received an offer. If there is no existing connection with this peer,
   * create one, then set the remotedescription and answer.
   *
   * @method _offerHandler
   * @private
   * @param {JSON} msg
   */
  Skyway.prototype._offerHandler = function (msg) {
    var targetMid = msg.mid;
    this._trigger('handshakeProgress', 'offer', targetMid);
    console.log('Test:');
    console.log(msg);
    var offer = new window.RTCSessionDescription(msg);
    console.log('API - [' + targetMid + '] Received offer:');
    console.dir(offer);
    var pc = this._peerConnections[targetMid];
    if (!pc) {
      this._openPeer(targetMid, false);
      pc = this._peerConnections[targetMid];
    }
    pc.setRemoteDescription(offer);
    this._doAnswer(targetMid);
  };

  /**
   * We have succesfully received an offer and set it locally. This function will take care
   * of cerating and sendng the corresponding answer. Handshake step 4.
   *
   * @method _doAnswer
   * @private
   * @param {String} targetMid The peer we should connect to.
   * @param {Boolean} toOffer Wether we should start the O/A or wait.
   */
  Skyway.prototype._doAnswer = function (targetMid) {
    console.log('API - [' + targetMid + '] Creating answer.');
    var pc = this._peerConnections[targetMid];
    var self = this;
    if (pc) {
      pc.createAnswer(function (answer) {
        console.log('API - [' + targetMid + '] Created  answer.');
        console.dir(answer);
        self._setLocalAndSendMessage(targetMid, answer);
      },
        function (error) {
        self._onOfferOrAnswerError(targetMid, error);
      },
        self._room.pcHelper.sdpConstraints);
    } else {
      return;
      /* Houston ..*/
    }
  };

  /**
   * Fallback for offer or answer creation failure.
   *
   * @method _onOfferOrAnswerError
   * @private
   */
  Skyway.prototype._onOfferOrAnswerError = function (targetMid, error) {
    console.log('API - [' + targetMid + '] Failed to create an offer or an answer.' +
      ' Error code was ' + JSON.stringify(error));
  };

  /**
   * We have a peer, this creates a peerconnection object to handle the call.
   * if we are the initiator, we then starts the O/A handshake.
   *
   * @method _openPeer
   * @private
   * @param {String} targetMid The peer we should connect to.
   * @param {Boolean} toOffer Wether we should start the O/A or wait.
   */
  Skyway.prototype._openPeer = function (targetMid, toOffer) {
    console.log('API - [' + targetMid + '] Creating PeerConnection.');
    this._peerConnections[targetMid] = this._createPeerConnection(targetMid);
    // NOTE ALEX: here we could do something smarter
    // a mediastream is mainly a container, most of the info
    // are attached to the tracks. We should iterates over track and print
    console.log('API - [' + targetMid + '] Adding local stream.');
    if (toOffer) { // Based on only one user creates the offer
      this._createDC(this._user.id, targetMid, null, true, null);
    }
    if (this._user.streams.length > 0) {
      for (var i in this._user.streams) {
        if (this._user.streams.hasOwnProperty(i)) {
          this._peerConnections[targetMid].addStream(this._user.streams[i]);
        }
      }
    } else {
      console.log('API - WARNING - No stream to send. You will be only receiving.');
    }
    // I'm the callee I need to make an offer
    if (toOffer) {
      this._doCall(targetMid);
    }
  };

  /**
   * The remote peer advertised streams, that we are forwarding to the app. This is part
   * of the peerConnection's addRemoteDescription() API's callback.
   *
   * @method _onRemoteStreamAdded
   * @private
   * @param {String} targetMid
   * @param {Event}  event      This is provided directly by the peerconnection API.
   */
  Skyway.prototype._onRemoteStreamAdded = function (targetMid, event) {
    console.log('API - [' + targetMid + '] Remote Stream added.');
    this._trigger('addPeerStream', targetMid, event.stream);
  };

  /**
   * it then sends it to the peer. Handshake step 3 (offer) or 4 (answer)
   *
   * @method _doCall
   * @private
   * @param {String} targetMid
   */
  Skyway.prototype._doCall = function (targetMid) {
    var pc = this._peerConnections[targetMid];
    // NOTE ALEX: handle the pc = 0 case, just to be sure
    // temporary measure to remove Moz* constraints in Chrome
    var oc = this._room.pcHelper.offerConstraints;
    if (window.webrtcDetectedBrowser.webkitWebRTC) {
      for (var prop in oc.mandatory) {
        if (oc.mandatory.hasOwnProperty(prop)) {
          if (prop.indexOf('Moz') !== -1) {
            delete oc.mandatory[prop];
          }
        }
      }
    }
    var constraints = oc;
    var sc = this._room.pcHelper.sdpConstraints;
    for (var name in sc.mandatory) {
      if (sc.mandatory.hasOwnProperty(name)) {
        constraints.mandatory[name] = sc.mandatory[name];
      }
    }
    constraints.optional.concat(sc.optional);
    console.log('API - [' + targetMid + '] Creating offer.');
    var self = this;
    pc.createOffer(function (offer) {
      self._setLocalAndSendMessage(targetMid, offer);
    },
      function (error) {
      self._onOfferOrAnswerError(targetMid, error);
    },
      constraints);
  };

  /**
   * This takes an offer or an aswer generated locally and set it in the peerconnection
   * it then sends it to the peer. Handshake step 3 (offer) or 4 (answer)
   *
   * @method _setLocalAndSendMessage
   * @private
   * @param {String} targetMid
   * @param {JSON} sessionDescription This should be provided by the peerconnection API.
   * User might 'tamper' with it, but then , the setLocal may fail.
   */
  Skyway.prototype._setLocalAndSendMessage = function (targetMid, sessionDescription) {
    console.log('API - [' + targetMid + '] Created ' + sessionDescription.type + '.');
    console.log(sessionDescription);
    var pc = this._peerConnections[targetMid];
    // NOTE ALEX: handle the pc = 0 case, just to be sure

    // NOTE ALEX: opus should not be used for mobile
    // Set Opus as the preferred codec in SDP if Opus is present.
    // sessionDescription.sdp = preferOpus(sessionDescription.sdp);

    // limit bandwidth
    // sessionDescription.sdp = limitBandwidth(sessionDescription.sdp);

    console.log('API - [' + targetMid + '] Setting local Description (' +
      sessionDescription.type + ').');

    var self = this;
    pc.setLocalDescription(
      sessionDescription,
      function () {
      console.log('API - [' + targetMid + '] Set. Sending ' + sessionDescription.type + '.');
      self._trigger('handshakeProgress', sessionDescription.type, targetMid);
      self._sendMessage({
        type : sessionDescription.type,
        sdp : sessionDescription.sdp,
        mid : self._user.id,
        target : targetMid,
        rid : self._room.id
      });
    },
      function () {
      console.log('API - [' +
        targetMid + '] There was a problem setting the Local Description.');
    });
  };

  /**
   * Create a peerconnection to communicate with the peer whose ID is 'targetMid'.
   * All the peerconnection callbacks are set up here. This is a quite central piece.
   *
   * @method _createPeerConnection
   * @return the created peer connection.
   * @private
   * @param {String} targetMid
   */
  Skyway.prototype._createPeerConnection = function (targetMid) {
    var pc;
    try {
      pc = new window.RTCPeerConnection(
          this._room.pcHelper.pcConfig,
          this._room.pcHelper.pcConstraints);
      console.log(
        'API - [' + targetMid + '] Created PeerConnection.');
      console.log(
        'API - [' + targetMid + '] PC config: ');
      console.dir(this._room.pcHelper.pcConfig);
      console.log(
        'API - [' + targetMid + '] PC constraints: ' +
        JSON.stringify(this._room.pcHelper.pcConstraints));
    } catch (e) {
      console.log('API - [' + targetMid + '] Failed to create PeerConnection: ' + e.message);
      return null;
    }

    // callbacks
    // standard not implemented: onnegotiationneeded,
    var self = this;
    pc.ondatachannel = function (event) {
      console.log('DataChannel Opened');
      var dc = event.channel || event;
      self._createDC(self._user.id, targetMid, null, false, dc);
    };
    pc.onaddstream = function (event) {
      self._onRemoteStreamAdded(targetMid, event);
    };
    pc.onicecandidate = function (event) {
      self._onIceCandidate(targetMid, event);
    };
    pc.oniceconnectionstatechange = function (fakeState) {
      console.log('API - [' + targetMid + '] ICE connection state changed -> ' +
        pc.iceConnectionState);
      self._trigger('iceConnectionState', pc.iceConnectionState, targetMid);
    };
    // pc.onremovestream = onRemoteStreamRemoved;
    pc.onsignalingstatechange = function () {
      console.log('API - [' + targetMid + '] PC connection state changed -> ' +
        pc.signalingState);
      self._trigger('peerConnectionState', pc.signalingState, targetMid);
    };
    pc.onicegatheringstatechange = function () {
      console.log('API - [' + targetMid + '] ICE gathering state changed -> ' +
        pc.iceGatheringState);
      self._trigger('candidateGenerationState', pc.iceGatheringState, targetMid);
    };
    return pc;
  };

  /**
   * A candidate has just been generated (ICE gathering) and will be sent to the peer.
   * Part of connection establishment.
   *
   * @method _onIceCandidate
   * @private
   * @param {String} targetMid
   * @param {Event}  event      This is provided directly by the peerconnection API.
   */
  Skyway.prototype._onIceCandidate = function (targetMid, event) {
    if (event.candidate) {
      var msgCan = event.candidate.candidate.split(' ');
      var candidateType = msgCan[7];
      console.log('API - [' + targetMid + '] Created and sending ' +
        candidateType + ' candidate.');
      this._sendMessage({
        type : 'candidate',
        label : event.candidate.sdpMLineIndex,
        id : event.candidate.sdpMid,
        candidate : event.candidate.candidate,
        mid : this._user.id,
        target : targetMid,
        rid : this._room.id
      });
    } else {
      console.log('API - [' + targetMid + '] End of gathering.');
      this._trigger('candidateGenerationState', 'done', targetMid);
    }
  };

  /**
   * Handling reception of a candidate. handshake done, connection ongoing.
   * @method _candidateHandler
   * @private
   * @param {JSON} msg
   */
  Skyway.prototype._candidateHandler = function (msg) {
    var targetMid = msg.mid;
    var pc = this._peerConnections[targetMid];
    if (pc) {
      if (pc.iceConnectionState === 'connected') {
        console.log('API - [' + targetMid + '] Received but not adding Candidate ' +
          'as we are already connected to this peer.');
        return;
      }
      var msgCan = msg.candidate.split(' ');
      var canType = msgCan[7];
      console.log('API - [' + targetMid + '] Received ' + canType + ' Candidate.');
      // if (canType !== 'relay' && canType !== 'srflx') {
      // trace('Skipping non relay and non srflx candidates.');
      var index = msg.label;
      var candidate = new window.RTCIceCandidate({
          sdpMLineIndex : index,
          candidate : msg.candidate
        });
      pc.addIceCandidate(candidate); //,
      // NOTE ALEX: not implemented in chrome yet, need to wait
      // function () { trace('ICE  -  addIceCandidate Succesfull. '); },
      // function (error) { trace('ICE  - AddIceCandidate Failed: ' + error); }
      //);
      console.log('API - [' + targetMid + '] Added Candidate.');
    } else {
      console.log('API - [' + targetMid + '] Received but not adding Candidate ' +
        'as PeerConnection not present.');
      // NOTE ALEX: if the offer was slow, this can happen
      // we might keep a buffer of candidates to replay after receiving an offer.
    }
  };

  /**
   * Handling reception of an answer (to a previous offer). handshake step 4.
   * @method _answerHandler
   * @private
   * @param {JSON} msg
   */
  Skyway.prototype._answerHandler = function (msg) {
    var targetMid = msg.mid;
    this._trigger('handshakeProgress', 'answer', targetMid);
    var answer = new window.RTCSessionDescription(msg);
    console.log('API - [' + targetMid + '] Received answer:');
    console.dir(answer);
    var self = this;
    var pc = this._peerConnections[targetMid];
    pc.setRemoteDescription(answer);
    pc.remotePeerReady = true;
  };

  /**
   * send a message to the signaling server
   * @method _sendMessage
   * @private
   * @param {JSON} message
   */
  Skyway.prototype._sendMessage = function (message) {
    if (!this._channel_open) {
      return;
    }
    var msgString = JSON.stringify(message);
    console.log('API - [' + (message.target ? message.target : 'server') +
      '] Outgoing message: ' + message.type);
    this._socket.send(msgString);
  };

  /**
   * @method _openChannel
   * @private
   */
  Skyway.prototype._openChannel = function () {
    var self = this;
    var _openChannelImpl = function (readyState) {
      if (readyState !== 2) {
        return;
      }
      self.off('readyStateChange', _openChannelImpl);
      console.log('API - Opening channel.');
      var ip_signaling =
        'ws://' + self._room.signalingServer.ip + ':' + self._room.signalingServer.port;
      console.log('API - Signaling server URL: ' + ip_signaling);
      self._socket = window.io.connect(ip_signaling, {
          'force new connection' : true
        });
      self._socket.on('connect', function () {
        self._channel_open = true;
        self._trigger('channelOpen');
      });
      self._socket.on('error', function (err) {
        console.log('API - Channel Error: ' + err);
        self._channel_open = false;
        self._trigger('channelError');
      });
      self._socket.on('disconnect', function () {
        self._trigger('channelClose');
      });
      self._socket.on('message', function (msg) {
        self._processSigMsg(msg);
      });
    };

    if (this._channel_open) {
      return;
    }
    if (this._readyState === 0) {
      this.on('readyStateChange', _openChannelImpl);
      this._init(this);
    } else {
      _openChannelImpl(2);
    }

  };

  /**
   * @method _closeChannel
   * @private
   */
  Skyway.prototype._closeChannel = function () {
    if (!this._channel_open) {
      return;
    }
    this._socket.disconnect();
    this._socket = null;
    this._channel_open = false;
    this._readyState = 0; // this forces a reinit
  };

  /**
   * Note:
   *   Create DataChannel - Started during createOffer,
   *   answered in createAnswer
   *  - SCTP Supported Browsers (Older chromes won't work, it will fall back to RTP)
   *  - For now, Mozilla supports Blob and Chrome supports ArrayBuffer
   *
   * @method _createDC
   * @private
   * @param {String} selfId - User's own id
   * @param {String} peerId - The Other peer's id
   * @param {String} channel_name - The Name of the Channel. If null, it would be generated
   * @param {Boolean} isOffer - If the channel is initiated by the user
   * @param {RTCDataChannel} dataChannel - The DataChannel object passed inside
   */
  Skyway.prototype._createDC = function (selfId, peerId, channel_name, isOffer, dataChannel) {
    var self = this, pc = self._peerConnections[peerId];
    var type = (isOffer) ? 'offer' : 'answer', onDataChannel = false;
    var log_ch = 'DC [-][' + selfId + ']: ';

    try {
      console.log(log_ch + 'Initializing');
      if (!dataChannel) {
        if (!channel_name) {
          channel_name = peerId + '_' + type;
        }
        log_ch = 'DC [' + channel_name + '][' + selfId + ']: ';
        var options = {};
        if (!webrtcDetectedBrowser.isSCTPDCSupported) {
          options.reliable = false;
          console.warn(log_ch + 'Does not support SCTP');
        }
        dataChannel = pc.createDataChannel(channel_name, options);
      } else {
        channel_name = dataChannel.label;
        onDataChannel = true;
        log_ch = 'DC [{on}' + channel_name + '][' + selfId + ']: ';
        console.log(log_ch + 'Received Status');
        console.info('Channel name: ' + channel_name);
      }
      if (webrtcDetectedBrowser.mozWebRTC) {
        console.log(log_ch + 'Does support BinaryType Blob');
      } else {
        console.log(log_ch + 'Does not support BinaryType Blob');
      }
      dataChannel._type = type;
      dataChannel._offerer = (isOffer) ? selfId : peerId;
      dataChannel._answerer = (isOffer) ? peerId : selfId;
      dataChannel.onerror = function (err) {
        console.error(log_ch + 'Failed retrieveing dataChannel.');
        console.exception(err);
      };
      dataChannel.onclose = function () {
        console.log(log_ch + 'DataChannel closed.');
        self._closeDataCH(channel_name, true);
      };
      dataChannel.onopen = function () {
        dataChannel.push = dataChannel.send;
        dataChannel.send = function (data) {
          console.log(log_ch + 'DataChannel opened.');
          data = btoa(data);
          console.info(data);
          dataChannel.push(data);
        };
      };
      dataChannel.onmessage = function (event) {
        console.log(log_ch + 'DataChannel message received');
        console.info('Time received: ' + (new Date()).toISOString());
        console.info('Size: ' + event.data.length);
        console.info('======');
        var data = atob(event.data);
        console.info(data);
        self._dataCHHandler(data, self);
      };
      console.log(log_ch + 'DataChannel created.');
      window.RTCDataChannels[channel_name] = dataChannel;
      setTimeout(function () {
        console.log(log_ch + 'Connection Status - ' + dataChannel.readyState);
        if (onDataChannel && channel_name && dataChannel.readyState === 'open') {
          self._sendDataCH(channel_name, {
            status : 'connected',
            channel : channel_name
          });
        }
      }, 500);
    } catch (err) {
      console.error(log_ch + 'Failed creating DataChannel. Reason:');
      console.exception(err);
      return;
    }
  };

  /**
   * @method _sendDataCH
   * @private
   * @param {String} channel, {JSON} data
   */
  Skyway.prototype._sendDataCH = function (channel, data) {
    if (!channel) { return false; }
    var dataChannel = window.RTCDataChannels[channel];
    if (!dataChannel) {
      console.error('API - No available existing DataChannel at this moment');
      return;
    } else {
      console.log('API - [channel: ' + channel + ']. DataChannel found');
      try {
        dataChannel.send(JSON.stringify(data));
      } catch (err) {
        console.error('API - [channel: ' + channel + ']: An Error occurred');
        console.exception(err);
      }
    }
  };

  /**
   * @method _closeDataCH
   * @private
   * @param {String} channel, {Boolean} isClosed
   */
  Skyway.prototype._closeDataCH = function (channel) {
    if (!channel) {
      return;
    }
    try {
      if (!window.RTCDataChannels[channel]) {
        console.error('API - DataChannel "' + channel + '" does not exist');
        return;
      }
      window.RTCDataChannels[channel].close();
    } catch (err) {
      console.error('API - DataChannel "' + channel + '" failed to close');
      console.exception(err);
    }
    finally {
      setTimeout(function () {
        delete window.RTCDataChannels[channel];
      }, 500);
    }
  };

  /**
   * @method _dataHandlerCH
   * @private
   * @param {String} data
   */
  Skyway.prototype._dataCHHandler = function (_data, self) {
    console.log('API - DataChannel Received:');
    console.info(_data);
    var data = JSON.parse(_data), currentUser;
    if(data.sender) {
      currentUser = (data.sender.id === self._user.id);
    }
    var channel = data.channel, dataParams = {};
    switch (data.status) {
    case 'connected':
      // Channel is opened, be ready to send.
      // If there's no dataTransfers, abort. It's just an indication that other pc's dc has opened
      if (self._dataTransfers[data.channel]) {
        var _info = self._dataTransfers[data.channel].info;
        dataParams.sender = self._user.id;
        dataParams.channel = _info.channel;
        dataParams.itemId = _info.itemId;
        dataParams.status = 'sending';
        for(var i = 0; i < self._dataTransfers[data.channel].chunks.length; i++) {
          dataParams.chunk = self._dataTransfers[data.channel].chunks[i];
          dataParams.chunkId = i;
          self._sendDataCH(data.channel, dataParams);
        }
        self._dataTransfers[data.channel].status = 'sending';
      } else {
        console.log(
          'API - DataChannel["' + data.channel + '"] has been intialized'
        );
      }
      break;
    case 'sending':
      //self._trigger('receivedData', data, self._user.id);
      var itemId = data.itemId;
      if(!window.RTCDataStorage[itemId]) {
        window.RTCDataStorage[itemId] = [];
      }
      window.RTCDataStorage[itemId][data.chunkId] = new Blob(data.chunk);
      self._sendDataCH(channel, {
        status : 'received',
        sender : data.sender,
        receiver : self._user,
        itemId : itemId,
        channel : channel,
        chunkId: data.chunkId
      });
      break;
    case 'received':
      var user = data.receiver.id;
      self._dataTransfers[channel].completed.push(data.chunkId);
      console.log(
        'Uploaded Data Status: ' +
        self._dataTransfers[channel].completed.length + ' / ' +
        self._dataTransfers[channel].chunks.length
      );
      if(self._dataTransfers[channel].completed.length ===
       self._dataTransfers[channel].chunks.length) {
        self._trigger('receivedDataStatus', data);
        dataParams = self._dataTransfers[data.channel].info;
        dataParams.sender = data.sender;
        dataParams.receiver = data.receiver;
        dataParams.status = 'completed';
        dataParams.channel = channel;
        self._sendDataCH(channel, dataParams);
        setTimeout(function () {
          self._closeDataCH(channel);
          //delete self._dataTransfers[channel];
        }, 1200);
      }
      break;
    case 'completed':
      var blob;
      console.log(data);
      window.dataId = data.itemId;
      if(window.RTCDataStorage[data.itemId].length > 0) {
        blob = new Blob(window.RTCDataStorage[data.itemId],{type:data.itemType});
      } else {
        blob = window.RTCDataStorage[data.itemId];
      }
      data.data = URL.createObjectURL(blob);
      self._trigger('receivedData', data, self._user.id);
      setTimeout(function () {
        self._closeDataCH(channel);
        //delete window.RTCDataStorage[data.itemId];
      }, 1200);
      break;
    default:
      console.log('API - No type "' + data.type + '" is associated with any events.');
      break;
    }
  };

  /**
   * @method _chunkFile
   * @private
   * @params {Blob} blob
   * @params {Int} blobByteSize
   *
   * For now please send files below or around 2KB till chunking is implemented
   */
  Skyway.prototype._chunkFile = function (blob, blobByteSize) {
    var BYTES_PER_CHUNK = 1024 * 60; // 60 KB Limit | 4 KB for info
    var chunksArray = [], startCount = 0, endCount;
    console.log('File Size: ' + blobByteSize);
    if(blobByteSize > BYTES_PER_CHUNK) {
      for (var i = 0; i < blobByteSize; i+=BYTES_PER_CHUNK) {
        startCount = i;
        endCount = startCount + BYTES_PER_CHUNK;
        chunksArray.push(blob.slice(startCount, endCount));
      }
      if((blobByteSize-endCount)>0) {
        chunksArray.push(blob.slice(endCount, blobByteSize));
      }
    } else {
      chunksArray.push(blob);
    }
    window.test = chunksArray;
    return chunksArray;
  };

  /**
   * @method sendFile
   * @protected
   * @params {File} file - The file to be sent over
   */
  Skyway.prototype.sendFile = function(file) {
    console.log('API - Attaching File to Stream');
    var fr = new FileReader(), self = this;
    var fileInfo = {
      name: file.name,
      size: file.size,
      itemType: file.type
    };
    this._sendFileToPeers(fileInfo, file);
    /*fr.onload = function () {
      if ((fr.readyState === 'DONE' || fr.readyState == 2)) {
        var streamBuffer = new Uint8Array(fr.result);
        var blob = (streamBuffer, {type: file.type});
        var fileInfo = {
          name: file.name,
          size: file.size,
          itemType: file.type
        };
        console.info('====Blob Data====');
        console.log(file);
        console.log(blob);
        self._sendFileToPeers(fileInfo, blob);
      }
    };
    if(fr.readAsArrayBuffer) {
      fr.readAsArrayBuffer(file);
    } else {
      fr.readAsBinaryString(file);
    }*/
  };

  /**
   * @method _sendFileToPeers
   * @private
   * @params {JSON} fileInfo - The file information
   * @params {Blob} blob - The Binary Large Object of the file
   */
  Skyway.prototype._sendFileToPeers = function(fileInfo, blob) {
    console.log('API - Preparing File Sending to Queue');
    var self = this, noOfPeersSent = 0;
    var itemId = self._user.id +
      (((new Date()).toISOString().replace(/-/g, '').replace(/:/g, ''))).replace('.', '');
    fileInfo.itemId = itemId;
    var fileChunks = this._chunkFile(blob, fileInfo.size);

    for (var peer in self._peerConnections) {
      if(self._peerConnections.hasOwnProperty(peer) && self._peerConnections[peer]) {
        console.log(
          'API - Creating DataChannel for sending File for Peer ' + peer
        );
        console.dir(self._peerConnections[peer]);
        var channel = peer + itemId;
        self._createDC(self._user.id, peer, channel, true, null, self);
        console.log(
          'API - Successfully created DataChannel for sending File to peer'
        );
        console.log('API - Channel name: ' + channel);
        console.log('API - File Id: ' + itemId);
        fileInfo.channel = channel;
        self._dataTransfers[channel] = {
          info: fileInfo,
          chunks: fileChunks,
          status: 'connecting',
          completed: []
        };
        noOfPeersSent++;
      } else {
        console.error('API - Peer "' + peer + '" does not exist');
      }
    }
    if (noOfPeersSent > 0 ) {
      console.log('API - Tracking File to User\'s chat log for Tracking');
      fileInfo.data = URL.createObjectURL(blob);
      fileInfo.sender = self._user;
      self._trigger('receivedData', fileInfo, self._user.id);
    } else {
      console.log('API - No Peers in here. Impossible to send file');
      self._dataTransfers = {};
    }
  };



  /**
   * TODO
   * @method toggleLock
   * @protected
   */
  Skyway.prototype.toggleLock = function () {
    /* TODO */
  };

  /**
   * TODO
   * @method toggleAudio
   * @protected
   */
  Skyway.prototype.toggleAudio = function (audioMute) {
    /* TODO */
  };

  /**
   * TODO
   * @method toggleVideo
   * @protected
   */
  Skyway.prototype.toggleVideo = function (videoMute) {
    /* TODO */
  };

  /**
   * TODO
   * @method authenticate
   * @protected
   * @param {String} email
   * @param {String} password
   */
  Skyway.prototype.authenticate = function (email, password) {};

  /**
   * @method joinRoom
   */
  Skyway.prototype.joinRoom = function () {
    if (this._in_room) {
      return;
    }
    var self = this;
    var _sendJoinRoomMsg = function () {
      self.off('channelOpen', _sendJoinRoomMsg);
      console.log('API - Joining room: ' + self._room.id);
      self._sendMessage({
        type : 'joinRoom',
        mid : self._user.id,
        rid : self._room.id,
        cid : self._key,
        roomCred : self._room.token,
        userCred : self._user.token,
        tokenTempCreated : self._user.tokenTimestamp,
        timeStamp : self._room.tokenTimestamp
      });
    };
    if (!this._channel_open) {
      this.on('channelOpen', _sendJoinRoomMsg);
      this._openChannel();
    } else {
      _sendJoinRoomMsg();
    }
  };

  /**
   * @method LeaveRoom
   */
  Skyway.prototype.leaveRoom = function () {
    if (!this._in_room) {
      return;
    }
    for (var pc_index in this._peerConnections) {
      if (this._peerConnections.hasOwnProperty(pc_index)) {
        this._removePeer(pc_index);
      }
    }
    this._in_room = false;
    this._closeChannel();
  };

  /**
   * TODO
   * @method getContacts
   * @protected
   */
  Skyway.prototype.getContacts = function () {
    if (!this._in_room) {
      return;
    }
    /* TODO */
  };

  /**
   * TODO
   * @method getUser
   * @protected
   */
  Skyway.prototype.getUser = function () {
    /* TODO */
  };

  /**
   * TODO
   * @method inviteContact
   * @protected
   */
  Skyway.prototype.inviteContact = function (contact) {
    /* TODO */
  };

}).call(this);
