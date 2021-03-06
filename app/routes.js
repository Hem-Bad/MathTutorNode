//routes.js
var User            = require('../app/models/user');
var videosession    = require('../app/models/videosession');
var emailTutor		= require('../app/models/emailtutor');


var request = require('request');
var OpenTok = require('opentok');


module.exports = function(app, passport) {

    // =====================================
    // INDEX PAGE (with login links) ========
    // =====================================
    app.get('/', function(req, res) {
        res.render('index.ejs'); // load the index.ejs file
    });

    // =====================================
    // HOME PAGE ===========================
    // =====================================
    app.get('/home', isLoggedIn, function(req, res) {
        res.render('home.ejs');
    });

    // =====================================
    // LOGIN ===============================
    // =====================================
    // show the login form
    app.get('/login', function(req, res) {

        // render the page and pass in any flash data if it exists
        res.render('login.ejs', { message: req.flash('loginMessage') });
    });

    // process the login form
    app.post('/login', passport.authenticate('local-login', {
        successRedirect : '/home', // redirect to the secure profile section
        failureRedirect : '/login', // redirect back to the signup page if there is an error
        failureFlash : true // allow flash messages
    }));

    // =====================================
    // SIGNUP ==============================
    // =====================================
    // show the signup form
    app.get('/signup', function(req, res) {

        // render the page and pass in any flash data if it exists
        res.render('signup.ejs', { message: req.flash('signupMessage') });
    });

    // process the signup form
    app.post('/signup', passport.authenticate('local-signup', {

        // form validation


        successRedirect : '/home', // redirect to the secure profile section
        failureRedirect : '/signup', // redirect back to the signup page if there is an error
        failureFlash : true // allow flash messages

    }));



    // =====================================
    // PAYMENT SECTIONS =====================
    // =====================================
    // setup braintree
    // process payment
    // redirect to videos tutoring session

    var bodyParser   = require('body-parser');
    var parseUrlEnconded = bodyParser.urlencoded({
      extended: false
    });
    // Braintree Sandbox env. use to connect to Braintree payments.
    // will have to re-factor code in a env file for security (future task)
    var braintree = require('braintree');
    var gateway = braintree.connect({
        environment:  braintree.Environment.Sandbox,
        merchantId:   'pyyjt9v8rfnh2px7',
        publicKey:    'vxk9d968nqydxc5c',
        privateKey:   '062d8f03343c2b75c7b494697d080b89'
    });

    // render payment page
    app.get('/payment', isLoggedIn, function (request, response) {
      var tutor = {
          firstName: request.query.fname,
          lastName: request.query.lname,
        }
		
      gateway.clientToken.generate({}, function (err, res) {
        response.render('payment', {
          clientToken: res.clientToken,
          tutor: tutor
        });
      });

    });

    //process payment via credit card or paypal
    // if err, redirect to error page, else success html
    app.post('/process', parseUrlEnconded, function (request, response) {
	  
      var transaction = request.body;
      //console.log('test transact', transaction);
      gateway.transaction.sale({
        amount: transaction.amount,
        paymentMethodNonce: transaction.payment_method_nonce,
        customer: {
          firstName: request.user.local.firstname,
          lastName: request.user.local.lastname,
          
        }
      }, function (err, result) {

        if (err) throw err;

        if (result.success) {

		//creates NEW videochat Session by calling createVideoSession function from videosession.js
		//this creates a new videochat session for the next student-tutor connection
		videosession.createVideoSession();

		//Variable keeps track of the session ID for the URL
		var sessID = videosession.getSessionID();
		
		var chatURL = ('https://mathboost.herokuapp.com/videochat/' + sessID);
		//var chatURL = ('http://localhost:8081/videochat/' + sessID);
		
		//Needs to be written
		var tutorEmail = 'tristan1594@yahoo.com';
		
	
		//call sendEmail function from emailtutor.js to send email to tutor
		  emailTutor.sendEmail(chatURL, tutorEmail);

          response.render('success', {
			//sessID is passed in order to launch video chat
			sessID : sessID,
            customerInfo: {
              id: result.transaction.id,
              firstName: request.user.local.firstname,
              lastName: request.user.local.lastname,
              amt: transaction.amount
            }
          });
		  
		

        } else {
          response.sendFile('error.html', {
            root: './public'
          });
        }
      });

    });


	// =====================================
    // VIDEOCHAT SECTION =======================
    // =====================================
	// Setup OpenTok
	// Create Initial/First Videochat Session
	
	
	//Create FIRST videochat session
	videosession.createVideoSession();
	var sessID = videosession.getSessionID();
	
	//Initialize OpenTok
	var opentok = videosession.getOpentok();


	app.get('/videoAdmin', function (req, res){
		res.render('videoAdmin.ejs');
	});

	//Dynamic Webpage Link generated based on sessID (videosession ID)
	app.get('/videochat/:sessID', function(req, res) {
	
	//generate a fresh token for this client
	token = videosession.createToken();

	res.render('videochat.ejs', {
		apiKey: videosession.getAPIKey(),
		sessionId: videosession.getSessionID(),
		token: token,
	});
	});

	//History of all recorded videochat sessions
	app.get('/history', function(req, res) {
		var page = req.param('page') || 1,
		offset = (page - 1) * 5;
		opentok.listArchives({ offset: offset, count: 5 }, function(err, archives, count) {
			if (err) return res.send(500, 'Could not list archives. error=' + err.message);
			res.render('history.ejs', {
			archives: archives,
			showPrevious: page > 1 ? ('/history?page='+(page-1)) : null,
			showNext: (count > offset + 5) ? ('/history?page='+(page+1)) : null
		});
	});
	});
	
	//Ability to download recorded videochat sessions
	app.get('/download/:archiveId', function(req, res) {
	var archiveId = req.param('archiveId');
	opentok.getArchive(archiveId, function(err, archive) {
		if (err) return res.send(500, 'Could not get archive '+archiveId+'. error='+err.message);
		res.redirect(archive.url);
	});
	});
	
	//Ability to delete recorded videochat sessions
	app.get('/delete/:archiveId', function(req, res) {
	var archiveId = req.param('archiveId');
	opentok.deleteArchive(archiveId, function(err) {
		if (err) return res.send(500, 'Could not stop archive '+archiveId+'. error='+err.message);
		res.redirect('/history');
	});
	});


    // =====================================
    // PROFILE SECTION =====================
    // =====================================
    // we will want this protected so you have to be logged in to visit
    // we will use route middleware to verify this (the isLoggedIn function)

    app.get('/profile', isLoggedIn, function(req, res) {

        User.find({},function(err,usrs){
            renderResult(res,usrs,"User List",req.user,'profile')
        });
    });


    // =====================================
    // RENDER RESULTS ======================
    // =====================================
    // wrote this as a multipurpose function to deliver an array of users
    // to the page. the page will accept the array as 'people'.
    // userlist page - just delivers a full list
    // search page - will deliver a list that fulfills the criteria
    // it's a very short function but basically runs the user list and search results - ML
    function renderResult(res,usrs=false,msg,user,page){
        // page will change depending on what page is running this function
        res.render(page + '.ejs', {message: msg, people:usrs, user : user},
            // the function is rendering the page requested, along with error messages, the array of users,
            // and the currently logged in user. This function below breaks out if there's an error.
            function (err,result){
                if (!err){res.end(result);}
                else {res.end('Oops!');
                console.log(err);}

            });
    }

    // =====================================
    // EDIT USER ===========================
    // =====================================

    app.get('/update', isLoggedIn, function(req, res){
        res.render('update.ejs', {
            message: req.flash('updateMessage'),
            user : req.user
        });
    })

    // process the update form
    // this needs to be updated to actually update the rest of the user fields
    // it was kept concise while we worked on other parts of the project
    // and basically for proof of concept.  - ML
    app.post('/update', isLoggedIn, function(req, res){
        //console.log(req.session.passport.user);
        //console.log(req.user);
        //console.log(req.user.local.email);
        User.update({_id:req.session.passport.user}, {
            'local.firstname' : req.body.firstname
        }, function(err, numberAffected,rawResponse) {
            //console.log(req.body.firstname);
            console.log('profile update error');
        });
        User.find({},function(err,usrs){
            renderResult(res,usrs,"User List",req.user,'profile')
        });
    });

    // =====================================
    // USERLIST SECTION ====================
    // =====================================
    // copied from the profile code
    // we will want this protected so you have to be logged in to visit
    // we will use route middleware to verify this (the isLoggedIn function)

    app.get('/users', isLoggedIn, function(req, res) {
        User.find({},function(err,usrs){
            //console.log("\nUsers: ");
            //console.log(usrs);
            renderResult(res,usrs,"User List",req.user,'users')
        });
    });


    // =====================================
    // SEARCH TUTORS =======================
    // =====================================

    // This works, but when doing multiple searches, it runs into errors
    // It doesn't re-search very well if you switch back and forth - ML
    app.get('/search', isLoggedIn, function(req,res) {
        renderResult(res,false,"Tutors",req.user,'search')
    });

    app.post('/search', isLoggedIn, function(req,res){
        console.log(req.body.searchbox);

        // searches names & classes
        // This is using MongoDB - ML
        // https://docs.mongodb.com/manual/reference/method/db.collection.find  
        if(req.body.searchbox != "" && req.body.selectsearch === ""){
            //console.log("text entered");
            User.find(
                { $and: [
                    {"local.job" : "Tutor"},
                    { $or: [{"local.firstname": { $regex : req.body.searchbox, $options : 'i'}},{"local.lastname": { $regex : req.body.searchbox, $options : 'i'}},{"local.classes": { $regex : req.body.searchbox, $options : 'i'}}]}
                    ]
                },
                function(err,usrs){
                //console.log("\nTutors");
                //console.log(usrs);
                renderResult(res,usrs,"Tutors",req.user,'search')
            })
        }
        else if (req.body.selectsearch != "" && req.body.searchbox === "") {
            //console.log("select search " + req.body.selectsearch);
            User.find(
                { $and: [
                    {"local.job" : "Tutor"},
                    {"local.classes": { $regex : req.body.selectsearch, $options : 'i'}}
                    ]
                },
                function(err,usrs){
                //console.log("\nTutors");
                //console.log(usrs);
                renderResult(res,usrs,"Tutors",req.user,'search')
            })
        }

    });




    // =====================================
    // FORGOT PASS =========================
    // =====================================

    //needs to be written

    // =====================================
    // RESET PASS ==========================
    // =====================================

    //needs to be written

    // =====================================
    // LOGOUT ==============================
    // =====================================
    app.get('/logout', function(req, res) {
        req.logout();
        res.redirect('/');
    });



};

// route middleware to make sure a user is logged in
// in further updates, we'll need to create a user session in order to check
// that a user is *currently* logged in, and update that variable in the User model
// (and also update when the user logs out) - ML
function isLoggedIn(req, res, next) {

    // if user is authenticated in the session, carry on
    if (req.isAuthenticated())
        return next();

    // if they aren't redirect them to the home page
    res.redirect('/');
};
