require('dotenv').config();
const source = process.env.MONGODB_URI;
const express = require('express');
const app = express();
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const { Schema } = mongoose;


/** Constants */
const ID_LENGTH = 24;
const MINLENGTH = [3, 'Must have at least 3 characters - you entered {VALUE}'];
const IDLENGTH = [ID_LENGTH, `Must be ${ID_LENGTH} characters long - you entered {VALUE}`];

/** Schemas */
const userSchema = new Schema({
  username: { type: String, required: true,
              unique: true, dropDups: true,
              trim: true,
              minLength: MINLENGTH
            }
}, { autoIndex: false });

const exerciseSchema = new Schema({
  userid:      { type: String, required: true,
                 trim: true,
                 minLength: IDLENGTH,
                 maxLength: IDLENGTH
               },
  description: { type: String, required: true,
                 trim: true,
                 minLength: MINLENGTH
               },
  duration:    { type: Number, required: true,
                 min:  [1, 'Must be at least 1 minute long']
               },
  date:        { type: Number, required: true
               }
}, { autoIndex: false });

/** Models */
const user     = mongoose.model("user",     userSchema);
const exercise = mongoose.model("exercise", exerciseSchema);

/** Connect to database */
mongoose.connect(source, { useNewUrlParser: true, useUnifiedTopology: true });
// const connection = mongoose.connection;connection.once("open", function() {
//   console.log("*** MongoDB got connected ***");
//   console.log(`Our Current Database Name : ${connection.db.databaseName}`);
//   mongoose.connection.db.dropDatabase(
//     console.log(`${connection.db.databaseName} database dropped.`)
//   );
// });

/** Middleware */
app.use(bodyParser.urlencoded({extended: false}))
app.use(express.json())
app.use(cors())
app.use(express.static('public'))
app.get('/', async (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
  await user.syncIndexes();
  await exercise.syncIndexes();
// deleteUsers();
// deleteExercises();
// const users = await user.estimatedDocumentCount();
// console.log(`users:${users}:`);
// const exercises = await exercise.estimatedDocumentCount();
// console.log(`exercises:${exercises}:`);
// const exerciseList = await exercise.find()
//          .then(function(recs) { return recs });
// console.log(`exerciseList:${exerciseList}:`);
});

/** Functions */
function isValidDate(dateString) {
  const regEx = /^\d{4}-\d{2}-\d{2}$/;
  // Invalid format
  if(!dateString.match(regEx)) return false;
  const d = new Date(dateString);
  const dNum = d.getTime();
  // NaN value, Invalid date
  if (!dNum && dNum !== 0) return false;
  return d.toISOString().slice(0,10) === dateString;
}

const deleteUsers = async () => {
  try {
    await user.deleteMany({});
  }
  catch (error) {
    throw error
  }
}

const deleteExercises = async () => {
  try {
    await exercise.deleteMany({});
  }
  catch (error) {
    throw error
  }
}

/** Process routes */
app.get('/api/users', (req, res) => {
  user.find({}, 'username _id')
    .then(function(recs) {
            if (recs.length === 0) {
              res.json({ error: 'no users in database!' });
            }
            else {
                const arr = [];
                for(let i in recs) {
                  const o = { username: recs[i].username,
                             _id: recs[i]._id };
                  arr.push(o);
                }
                res.json(arr);
            }
        })
});

app.get('/api/users/:_id/logs', async (req, res) => {
  try {
    if (!req.params._id) {
      res.json({ error: "Invalid id" });
    }
    const userid = req.params._id;
    const userFind = await user.findOne({ _id: userid });
    if (!userFind) {
      res.json({ error: 'user is not in database!',
                 id:    userid
               });
    }
    const username = userFind.username;
    let arrExercises = [], fromN = 0, toN = 0;
    if ((req.query.from) || (req.query.to) || (req.query.limit)) {
      let { from, to, limit } = req.query;
      if (from) {
        if (!isValidDate(from)) {
          return res.json({ error: `Invalid 'from' date - ${from}`})
        }
        fromN = Number(from.replace(/-/g, ''));
      }
      else {
        fromN = 18471231;
      }
      // from = from.getTime();
      // from = new Date(new Date(new Date(from).toISOString()).setHours(0, 0, 0, 0));
      if (to) {
        if (!isValidDate(to)) {
          return res.json({ error: `Invalid 'to' date - ${to}`})
        }
        toN = Number(to.replace(/-/g, ''));
      }
      else {
        toN = 99991231;
      }
      // to = to.getTime();
      // to = new Date(new Date(new Date(to).toISOString()).setHours(0, 0, 0, 0));
      exercise.find({ userid: userid, date: { $gte: fromN, $lte: toN } })
              .limit(parseInt(req.query.limit) || null)
              .exec((err, data) => {
                if (err) {
                  res.json({error: err})
                }
                for (let i = 0; i < data.length; i++) {
                  let dd = data.date.toString();
                  dd = dd.substring(0,4)+'-'+dd.substring(4,2)+'-'+dd.substring(6,2);
                  dd = new Date(dd).toDateString();
                  arrExercises.push({
                    'description': data[i].description,
                    'duration':    data[i].duration,
                    'date':        dd
                  })
                }
                res.json({ 'username': username,
                           'count':    arrExercises.length,
                           '_id':      userid,
                           'log':      arrExercises
                         });
              })
    }
    else {
      exercise.find({ userid: userid })
              .exec((err, data) => {
                if (err) {
                  res.json({error: err})
                }
                for (let i = 0; i < data.length; i++) {
                  arrExercises.push({
                    'description': data[i].description,
                    'duration':    data[i].duration,
                    'date':        data[i].date.toDateString()
                  });
                }
                res.json({ 'username': username,
                           'count':    arrExercises.length,
                           '_id':      userid,
                           'log':      arrExercises
                         });
              })
    }
  }
  catch (err) {
    return res.json({ 'error at catch': err.message });
  }
});

app.post('/api/users', async function(req, res) {
  const passedUsername = req.body.username;
  const newUser = new user({username: passedUsername});
  const error = newUser.validateSync();
  if (error) {
    res.json({ error: error.errors.username.message });
  }
  else {
    //Check if not in database
    async function getRec(usernameArg) {
      return await user.findOne({username: usernameArg})
              .then(function(recs) { return recs });
    }
    const userFind = await getRec(passedUsername);
    if (userFind === null) { //not in database
      //add
      newUser.save(function(err, data) {
        if (err) return console.error(err);
        //display
        res.json({ username : passedUsername,
                   _id      : data._id
                 });
      });
    }
    else {
      res.json({ '':'Already in the database',
                username : passedUsername,
                _id      : userFind._id
               });
    }
  }
});

app.post('/api/users/:_id/exercises', async function(req, res) {
  const id = req.params._id;
  const {description, duration, date} = req.body;
  if (date) {
    if (!isValidDate(date)) {
      return res.json({ error: `${date} is not a valid date - must be in format yyyy-mm-dd`})
    }
  }
  const passedDate = Number((date) 
                            ? date.replace(/-/g, '')
                            : new Date().toISOString().substring(0, 10).replace(/-/g, '')
                           );
  const newExercise = new exercise({userid: id,
                                    description: description,
                                    duration: duration,
                                    date: passedDate
                                   });
  const error = newExercise.validateSync();
  if (error !== undefined) {
    const errMsg = { '':'Error(s)'};
    if (error && error.errors.userid !== undefined) {
      errMsg.id = error.errors.userid.message;
    }
    if (error && error.errors.description !== undefined) {
      errMsg.description = error.errors.description.message;
    }
    if (error && error.errors.duration !== undefined) {
      errMsg.duration = error.errors.duration.message;
    }
    if (error && error.errors.date !== undefined) {
      errMsg.date = error.errors.date.message;
    }
    return res.json(errMsg);
  }
  async function getUser(idArg) {
    return await user.findOne({_id: idArg})
            .then(function(recs) { return recs });
  }
  const userFind = await getUser(id);
  if (userFind === null) { //not in database
    return res.json({ error: `user with _id of ${id} is not in database!` });
  }
  const username = userFind.username;
  //Check if exercise in database
  exercise.findOne({userid: id,
                    description: description
                   })
          .exec(function(err, exercises) {
            if (err) {
              res.json({ error: err });
            }
            else {
              if (exercises === null) { //not found
                //add
                // newExercise.date = newExercise.date.getTime();
                // newExercise.date = new Date(new Date(new Date(newExercise.date).toISOString()).setHours(0, 0, 0, 0));
                newExercise.save(function(err, data) {
                  if (err) {
                    res.json({ error : err });
                  }
                  else {
                    //display
                    let d = data.date.toString();
                    d = d.substring(0,4)+'-'+d.substring(4,2)+'-'+d.substring(6,2);
                    d = new Date(d).toDateString();
                    res.json({ username   : username,
                               description: description,
                               duration   : data.duration,
                               date       : d,
                               _id        : id
                             });
                  }
                });
              }
              else {
                res.json({ '':'Already in the database',
                          username    : username,
                          description : description,
                          duration    : exercises.duration,
                          date        : exercises.date.toDateString(),
                          _id         : id
                         });
              }
            }
          })
});

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port)
})
