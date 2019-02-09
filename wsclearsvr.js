var WebSocketServer = require('websocket').server;
var WebSocketClient = require("websocket").client;
var http = require('http');
var https = require('https');
const fs = require('fs');
 
var options = {
  hostname: 'sandbox.api.ndi.gov.sg',
  port: 443,
  path: '/asp/api/v1/asp/di-auth',
  method: 'POST',
  headers: {
       'Content-Type': 'application/json',
       'Content-Length': 200 
     }
};

var clients = [];

var sync_server = http.createServer(function(req, res) {
    console.log("SYNC_SERVER: IN received request");
    if (req.method == 'POST') {
        console.log("POST");

        var body = '';
        var sync_resp = '';
        var sync_status = 0;
        req.on('data', function (data) {
            body += data;
        });
        req.on('end', function () {
            console.log("SYNC_SERVER: Body: " + body);
            options.headers["Content-Length"] = body.length; 
            var NDI_req = https.request(options,(NDI_res) => {
              console.log('SYNC_SERVER: OUT NDI post status code:', NDI_res.statusCode);
              console.log('SYNC_SERVER: OUT NDI post headers: ',NDI_res.headers);

              NDI_res.on('data',(NDI_data) =>{
		process.stdout.write(NDI_data);
                //console.log('NDI post response [',NDI_data,']');

		{
			// here we do the websocket wait 

			var NDI_auth_req_id = '';
			var expires = 300;

			NDI_auth_req_id = (JSON.parse(NDI_data))["auth_req_id"];
			expires = (JSON.parse(NDI_data))["expires_in"]; 
			if (NDI_auth_req_id.length < 1)
			{
				sync_status = 404;
				sync_resp = "Error - Unable to find auth_req_id from NDI";
				res.statusCode = sync_status;
				res.end(sync_resp);
			}
			else
			{
				// I haven't handled timeouts or other websocket errors

				// assume that you send to websocket and got response.			
				var webclient = new WebSocketClient();

				webclient.on('connectFailed',function(error) {
 					console.log('SYNC_SERVER: socketclient connectFailed: ' + error.toString());
				});

				webclient.on('connect',function(connection) {
  					console.log('SYNC_SERVER: socketclient Websocket client connected');
  					connection.on('error',function(error) {
    						console.log('SYNC_SERVER: socketclient connect, connection error: '+error.toString());
  					});
  					connection.on('close',function(){
    						console.log('SYNC_SERVER: socketclient connection closed');
  					});
  					connection.on('message',function(message){
    						console.log('SYNC_SERVER: socketclient message: ['+ message.utf8Data + ']');
						sync_status = 200;
						sync_resp = message.utf8Data ;
						res.statusCode = sync_status;
						res.end(sync_resp);
						connection.close();
						
  					});

				});

				webclient.connect("ws://localhost:3000/","echo-protocol",NDI_auth_req_id,null,null);

			}	

		}

             });

             NDI_res.on('error',(e) => {
               console.error(e);
             });
           });
           NDI_req.write(body);
       });
      
    }
    else
    {
      res.statusCode = 404;
      res.end();
    }
});
sync_server.listen(80, function() {
    console.log((new Date()) + ' SyncServer is listening on port 80');
});

var ext_server = https.createServer({
    pfx: fs.readFileSync('ws.pfx')
  }, function(req, res) {
    console.log("EXT_SERVER: received request");
    if (req.method == 'POST') {
        console.log("EXT_SERVER: received POST from NDI");
        var body = '';
        req.on('data', function (data) {
            body += data;
        });
        req.on('end', function () {
            console.log("EXT_SERVER: received Body: " + body);
        });
	{
		// I haven't handled timeouts or other websocket errors

		// assume that you send to websocket and got response.			
		var webclient = new WebSocketClient();

		webclient.on('connectFailed',function(error) {
 			console.log('EXT_SERVER: socketclient connectFailed: ' + error.toString());
		});

		webclient.on('connect',function(connection) {
  			console.log('EXT_SERVER: socketclient Websocket client connected');
  			connection.on('error',function(error) {
    				console.log('EXT_SERVER: socketclient connect, connection error: '+error.toString());
  			});
  			connection.on('close',function(){
    				console.log('EXT_SERVER: socketclient connection closed');
  			});
  			connection.on('message',function(message){
    				console.log('EXT_SERVER: socketclient message: ['+ message + ']');
				
  			});
			connection.send(body);	
			connection.close();

		});

		webclient.connect("ws://localhost:3000/","echo-protocol","external",null,null);

	}	

        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end('post received');
    }
    res.end();
});
ext_server.listen(443, function() {
    console.log((new Date()) + ' ExtServer is listening on port 443');
});

var server = http.createServer(function(request, response) {
    console.log((new Date()) + 'SOCK_SERVER Received request for ' + request.url);
    response.writeHead(404);
    response.end();
});
server.listen(3000, function() {
    console.log((new Date()) + ' Websocket Server is listening on port 3000');
});
 
wsServer = new WebSocketServer({
    httpServer: server,
    // You should not use autoAcceptConnections for production
    // applications, as it defeats all standard cross-origin protection
    // facilities built into the protocol and the browser.  You should
    // *always* verify the connection's origin and decide whether or not
    // to accept it.
    autoAcceptConnections: false
});
 
function originIsExternal(origin) {
  // put logic here to detect whether the specified origin is allowed.
  if (origin === "external")
    return true
  return false;
}

var history = [];

function htmlEntities(str) {
  return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

 
wsServer.on('request', function(request) {

    var connection = request.accept("echo-protocol", request.origin);

    var index;

    if (!originIsExternal(request.origin)) {
       var obj = {
            time   : (new Date()).getTime(),
            authID : request.origin,
            connID : connection
        };
        index = clients.push(obj) -1;
    }
    
    console.log((new Date()) + 'SOCK_SERVER: Connection from ' + request.origin + ' accepted.');
    connection.on('message', function(message) {
        if (message.type === 'utf8') {
            console.log('SOCK_SERVER : Received Message: ' + message.utf8Data);
            if (originIsExternal(request.origin)) {

console.log("SOCK_SERVER: received message from NDI [",message,"]");
			var extAuthID = (JSON.parse(message.utf8Data))["auth_req_id"];
  
/*
			var nowtime = (new Date()).getTime();

			while (clients.length > 0)
			{
				if (nowtime < (clients[0].time + 3000000)) {
					clients.shift();
					console.log("SOCK_SERVER: clearing client ", clients[0]["authID"] , " due to timeout");
				}
	  			else
					break;
			}
	 
*/
// we assume that the client has already connected to the server.  Else the message is lost

console.log("SOCK_SERVER number of clients ", clients.length);
			for (i=0;i < clients.length; i++) {
console.log("SOCK_SERVER client authid [",clients[i]["authID"],"] ext authid [",extAuthID,"]");
				if (clients[i]["authID"] === extAuthID) {
					clients[i]["connID"].send(message.utf8Data);
					console.log("SOCK_SERVER sending response message ",message.utf8Data," from NDI to client ", clients[i]["authID"]);
				}
			}
        
			connection.close(); 

	        
            }		
        }
        else if (message.type === 'binary') {
            console.log('SOCK_SERVER Received Binary Message of ' + message.binaryData.length + ' bytes');
            // these are ignored
        }
    });
    connection.on('close', function(reasonCode, description) {
        if (!originIsExternal(request.origin))
	  clients.splice(index,1);
        console.log('SOCK_SERVER' + (new Date()) + ' origin [' +request.origin+'] '+ connection.remoteAddress + ' disconnected.');

    });
});
