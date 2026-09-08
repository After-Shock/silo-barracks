'use strict';
// The existing facade owns legacy shapes; v1 reads are passed through unchanged.
module.exports = request => ({ read: request });
