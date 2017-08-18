var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var bookSchema = new Schema({
    number: String,
    data: String,
    translation: String,
    opponentNumber: String,
    time: Number,
    analyzed: String
});

module.exports = mongoose.model('book', bookSchema);