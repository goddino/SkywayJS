//------------
// Create our Skyway object
var SkywayDemo = new Skyway();

////////////////////////////////////
///////TO FILL
var APPKEYID = XXXXXXXX - XXXX - XXXX - XXXX - XXXXXXXXXXXX;
var ROOMNAME = "demo";
var SKYWAYSERVER = "http://api.temasys.com.sg/";
///////
///////////////////////////////////

(function()
{
  SkywayDemo.init(
  {
    roomserver: SKYWAYSERVER,
    apiKey: APPKEYID,
    defaultRoom: ROOMNAME,
    region: "sg"
  });
})();

//--------
SkywayDemo.on('readyStateChange', function(state)
{
  console.log("readyStateChange");
  if (state === SkywayDemo.READY_STATE_CHANGE.COMPLETED)
  {
    SkywayDemo.joinRoom(
    {
      audio: true,
      video: true
    });
  }
});
//--------
SkywayDemo.on('mediaAccessSuccess', function(stream)
{
  console.log("mediaAccessSuccess");
  attachMediaStream(document.getElementById("myVideo"), stream);
});
//--------
SkywayDemo.on('incomingStream', function(peerID, stream, isSelf)
{
  if (!isSelf)
  {
    console.log("addPeerStream");
    var DOMRemoteVideo = document.createElement('video');
    DOMRemoteVideo.setAttribute("style", "width: 320px; height: 240px;");
    DOMRemoteVideo.setAttribute("autoplay", "autoplay");
    DOMRemoteVideo.setAttribute("id", "remote_" + peerID);
    var DOMcontainer = document.getElementById("remoteContainer");
    DOMcontainer.appendChild(DOMRemoteVideo);
    attachMediaStream(DOMRemoteVideo, stream);
  }

});
//--------
SkywayDemo.on('peerLeft', function(peerID)
{
  console.log("peerLeft");
  var DOMvideo = document.getElementById("remote_" + peerID);
  var DOMcontainer = document.getElementById("remoteContainer");
  DOMvideo.src = '';
  DOMcontainer.removeChild(DOMvideo);
});