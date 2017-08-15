var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var bookSchema = new Schema({
    number: String,
    name: String,
    data: String,
    opponentNumber: String,
    time: Number,
    analyzed: String
});

module.exports = mongoose.model('book', bookSchema);