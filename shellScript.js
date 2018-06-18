var pm2 = require('pm2');
var shell = require('shelljs');
var cron = require('node-cron');
var importFIle = require('import');
let SES = require('aws-sdk/clients/ses');
let mailcomposer = require('mailcomposer');
let env = require('./env.json');
let Slack = require('slack-node');

cron.schedule('*/10 * * * * *', function(){
	pm2.connect(function(err) {
		if (err) {
			console.error(err);
			process.exit(2);
		}else
			pm2.list(function(err, list){
				list.forEach(function(currentProcess){
					// console.log("currentProcess: ", currentProcess)
					let pwd = currentProcess.pm2_env.pm_cwd;
					fileName = pwd+"/server/config.json";
					let fileObject = importFIle(fileName);
					if(fileObject){
						fileObject = JSON.parse(fileObject);
						let netstatPortChecking = "netstat -plnt | grep " + fileObject.port;
						shell.exec(netstatPortChecking, function (res) {
							if(!res){
								console.log("process is still running");
							}else{
								// console.log("error file path: ", currentProcess);
								console.log("====================== before flust the file content ===================");
								let errorContent = shell.cat(currentProcess.pm2_env.pm_err_log_path).stdout;
								if(errorContent){
									console.log("errorContent: ", errorContent);
									sendMail("akash@heady.io", {
										subject: currentProcess.name + " server error",
										body: `<pre>${errorContent}</pre>`
									}, null, function(error, mailSend){
										if(err){
											console.log("mail err: ", error);
											// process.exit(1);
										}
										else{
											notification(errorContent);
											console.log("mailSend: ", mailSend);
											shell.cp("/dev/null", currentProcess.pm2_env.pm_err_log_path);
											console.log("+++++++++++++++++++++ after flush the file content +++++++++++++++++++++");
											errorContent = shell.cat(currentProcess.pm2_env.pm_err_log_path).stdout;
											console.log("process has been stopped");
											console.log("errorContent: ", errorContent);
											pm2.restart(String(currentProcess.pm_id), function(err, res){
												console.log("res: ", res);
											});
											// process.exit(2);
										}
									});
								}
							}
						})
					}else{
						console.log("file not found");
						process.exit(2);
					}
				})
			})
	});
});



const sendMail = (to, emailObject, attachment, callback) => {
	var ses = new SES(env.aws);
	const mail = mailcomposer({
		from: 'hello@mycurbside.com',
		to: to,
		subject: emailObject.subject,
		html: emailObject.body,
		attachments: attachment
	});
	mail.build(function(err, message) {
		if (err) {
			console.log("error in building mail: ", err);
			return ;
		}
		// console.log("message: ", message);
		ses.sendRawEmail({
			RawMessage: {
				Data: message
			}
		}, function(err, data){
			if(err)
				callback(err, null);
			else
				callback(null, data);
		});
	});
}

let apiToken = env.slack["api-token"];
let slack = new Slack(apiToken);

let notification = function (errorContent) {
	slack.api('chat.postMessage', {
		text: `++++++++++++++++++++++++++++++++ server crash report +++++++++++++++++++++++++++
				\n` + errorContent + `
				\n=================================================================================`,
		channel: env.slack.channel
	}, function(err, response){
		if(err)
			console.log("notification error");
		else
			console.log("notification send successfully");
	});	
}
