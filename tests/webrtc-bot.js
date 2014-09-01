window.io = require('socket.io-client');

var adapter = require('./../node_modules/adapterjs/source/adapter.js');
var skyway  = require('./../source/skyway.js');

var sw = new skyway.Skyway();

var apikey = '5f874168-0079-46fc-ab9d-13931c2baa39';

var userID, peerID;

sw.on('readyStateChange', function (state) {
  console.info('ReadyStateChange: ' + state);
  if (state === sw.READY_STATE_CHANGE.COMPLETED) {
    sw.joinRoom();
  }
});

sw.on('peerJoined', function (_peerID, peerInfo, isSelf) {
  if (isSelf) {
    userID = _peerID;
  } else {
    peerID = _peerID;
  }
});

sw.on('dataTransferState', function (state, transferID, peerID) {
  if (state === sw.DATA_TRANSFER_STATE.UPLOAD_REQUEST) {
    sw.respondBlobRequest(peerID, true);
  }
});

sw.init(apikey);