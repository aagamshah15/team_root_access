// Links to the earlier research workspace retain their original customer and replay date.
if (new URLSearchParams(location.hash.slice(1)).has('view')) {
  void import('./main');
} else {
  void import('./grower/main');
}
