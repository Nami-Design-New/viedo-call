// Create Agora client
var client = AgoraRTC.createClient({
    mode: "rtc", codec: "vp8"
});
var socket_;  // Replace with your server URL

var localTracks = {
    videoTrack: null, audioTrack: null
};

var localTrackState = {
    videoTrackMuted: false, audioTrackMuted: false, recorder: null
};

var nodeUrl = "";
var endUrl = "";
var resourceId = "";
var sid = "";
var videoUrl = "";
var mode = "mix";
var sessionID = "";
var liveSessionEnded = "";
var liveSessionEndedTime = "";
var remoteUsers = {};
var isUsingFrontCamera = false; // Default to front camera

// Agora client options
var options = {
    appid: null, channel: null, uid: null, token: null, role: null,
};

// Auto join channel with params in URL
$(() => {
    var urlParams = new URL(location.href).searchParams;
    options.appid = urlParams.get("appid");
    options.channel = urlParams.get("channel");
    options.token = urlParams.get("token");
    options.uid = urlParams.get("uid");
    if (options.appid && options.channel) {
        $("#uid").val(options.uid);
        $("#appid").val(options.appid);
        $("#token").val(options.token);
        $("#channel").val(options.channel);
        $("#join-form").submit();
    }
});

$(document).ready(async function () {
    options.uid = $("#uid").val();
    options.appid = $("#appid").val();
    options.token = $("#token").val();
    options.channel = $("#channel").val();
    options.role = $("#role").val();
    nodeUrl = $("#node-url").val();
    sessionID = $("#session-id").val();
    endUrl = $("#endUrl").val();
    liveSessionEnded = $("#liveSessionEnded").val();
    liveSessionEndedTime = $("#liveSessionEndedTime").val();
    if (options.role == 'publisher') {
        socket_ = io(nodeUrl);
        socket_.on('connect', () => {
            console.log('provider connected');
        });
    }
    await join();
});

$("#leave").click(async function (e) {
    $('.loader-ajax').fadeIn(1000)

    await stopRecording()

});

async function stopRecording() {
    var method = {
        channel: options.channel, uid: options.uid, resource: resourceId, mode: mode, sid: sid
    };

    var videos = []
    console.log(method)
    $.post(`${nodeUrl}/stop`, method, function (data) {
        videos = data.serverResponse.fileList || [];
        videos.forEach(function (video_, index) {
            if (video_.fileName.includes('.mp4')) {
                videoUrl = video_.fileName;
            }
        })
    }).then(async function () {
        await endMeeting();
    })
}

async function endMeeting() {
    var method = {
        live_session_id: sessionID,
        video: videoUrl
    };
    $.post(`${endUrl}`, method, function (data) {
        if (options.role == 'publisher') {
            socket_.emit('end_session_provider',options.channel);
        }
    }).then(function () {
        leave()
    }).then(function () {
        window.location.href = liveSessionEnded;
    });
}

$("#mute-audio").click(function (e) {
    if (!localTrackState.audioTrackMuted) {
        muteAudio();
    } else {
        unmuteAudio();
    }
});

$("#mute-video").click(function (e) {
    if (!localTrackState.videoTrackMuted) {
        muteVideo();
    } else {
        unmuteVideo();
    }
});

$("#flip-camera").click(async function () {
    await flipCamera();
});

async function join() {
    // Add event listeners for remote users
    client.on("user-published", handleUserPublished);
    client.on("user-joined", handleUserJoined);
    client.on("user-left", handleUserLeft);

    try {
        // Join a channel and create local tracks
        [options.uid, localTracks.audioTrack, localTracks.videoTrack] = await Promise.all([client.join(options.appid, options.channel, options.token || null, options.uid || null), AgoraRTC.createMicrophoneAudioTrack({
            encoderConfig: "music_standard"
        }), AgoraRTC.createCameraVideoTrack({
            facingMode: 'environment'
        })]);

            showMuteButton();

            // Play local video track
            localTracks.videoTrack.play("smallVideo");

            // Publish local tracks to channel
            await client.publish(Object.values(localTracks));


    } catch (e) {
        console.error(e);
    }

    console.log("publish success");
}

async function leave() {

    for (var trackName in localTracks) {
        var track = localTracks[trackName];
        if (track) {
            track.stop();
            track.close();
            localTracks[trackName] = undefined;
        }
    }

    // Remove remote users and player views
    remoteUsers = {};
    $("#remote-playerlist").html("");

    // Leave the channel
    await client.leave();
    $("#local-player-name").text("");
    $("#join").attr("disabled", false);
    $("#leave").attr("disabled", true);
    $("#joined-setup").css("display", "none");
    hideMuteButton();
    console.log("client leaves channel success");
}

async function flipCamera() {
    try {
        // Unpublish the current video track
        await client.unpublish(localTracks.videoTrack);

        // Stop and close the current video track
        localTracks.videoTrack.stop();
        localTracks.videoTrack.close();

        // Toggle the camera (front/back)
        isUsingFrontCamera = !isUsingFrontCamera;

        // Create a new video track with the selected camera
        localTracks.videoTrack = await AgoraRTC.createCameraVideoTrack({
            facingMode: isUsingFrontCamera ? "user" : "environment"
        });

        // Play the new video track locally
        localTracks.videoTrack.play("local-player");

        // Publish the new video track to the channel
        await client.publish(localTracks.videoTrack);

    } catch (e) {
        console.error("Error during flip camera: ", e);
    }
}

async function startRecording() {
    var method = {
        channel: options.channel, uid: options.uid
    };
    $.post(`${nodeUrl}/acquire`, method, function (data) {
        resourceId = data.resourceId;
        console.warn(resourceId)
    }).then(function () {
        var method = {
            channel: options.channel, uid: options.uid, token: options.token, resource: resourceId, mode: mode
        };
        console.log(method)
        $.post(`${nodeUrl}/start`, method, function (data) {
            sid = data.sid
        })
    })
}


async function subscribe(user, mediaType) {
    const uid = user.uid;

    // Subscribe to a remote user
    await client.subscribe(user, mediaType);
    console.log("subscribe success");

    if (mediaType === 'video') {
    
        // Play the remote video
        user.videoTrack.play(`bigVideo`);
    }

    if (mediaType === 'audio') {
        user.audioTrack.play();
    }
}

function handleUserJoined(user) {
    const id = user.uid;
    remoteUsers[id] = user;
}

function handleUserLeft(user) {
    const id = user.uid;
    delete remoteUsers[id];
    $(`#player-wrapper-${id}`).remove();
}

function handleUserPublished(user, mediaType) {
    subscribe(user, mediaType);
}

function hideMuteButton() {
    $("#mute-video").css("display", "none");
    $("#mute-audio").css("display", "none");
}

function showMuteButton() {
    $("#mute-video").css("display", "inline-block");
    $("#mute-audio").css("display", "inline-block");
}

async function muteAudio() {
    if (!localTracks.audioTrack) return;

    await localTracks.audioTrack.setMuted(true);
    localTrackState.audioTrackMuted = true;
    $("#mute-audio").text("Unmute Audio");
}

async function muteVideo() {
    if (!localTracks.videoTrack) return;

    await localTracks.videoTrack.setMuted(true);
    localTrackState.videoTrackMuted = true;
    $("#mute-video").text("Unmute Video");
}

async function unmuteAudio() {
    if (!localTracks.audioTrack) return;

    await localTracks.audioTrack.setMuted(false);
    localTrackState.audioTrackMuted = false;
    $("#mute-audio").text("Mute Audio");
}

async function unmuteVideo() {
    if (!localTracks.videoTrack) return;

    await localTracks.videoTrack.setMuted(false);
    localTrackState.videoTrackMuted = false;
    $("#mute-video").text("Mute Video");
}
