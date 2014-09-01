grunt jshint;
type="$1";
param="$2";

#Detect the type of test to run
function get_test () {
  case "$type" in
    test)
      echo "Running test '$param'..";
      case "$param" in
        event)
          browserify tests/events-test.js | testling -x "$1";
          ;;
        webrtc)
          browserify tests/webrtc-test.js | testling -x "$1";
          ;;
        *)
          echo "Test '$param' not found.";
      esac
      ;;
    bot)
      echo "Running bot for test '$param'..";
      case "$param" in
        webrtc)
          browserify tests/webrtc-bot.js | testling -x "$1";
          ;;
        *)
          echo "Bot '$param' not found.";
      esac
      ;;
    *)
      echo "Command '$type' not found.";
  esac
}

#Detect the platform (similar to $OSTYPE)
OS="`uname`"
case $OS in
  'Linux')
    OS='Linux'
    get_test "google-chrome ";
    ;;
  'FreeBSD')
    OS='FreeBSD'
    alias ls='ls -G'
    get_test "google-chrome ";
    ;;
  'MINGW32_NT-6.1')
    OS='Windows'
    get_test "'C:/Program Files/Google/Chrome/Application/chrome.exe'";
    ;;
  'Darwin')
    OS='Mac'
    get_test "open -a /Applications/Google\ Chrome.app";
    ;;
  'AIX') ;;
  *) echo "OS $OS not recognized";;
esac