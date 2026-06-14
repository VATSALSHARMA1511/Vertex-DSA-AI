# String Manipulation

Strings are immutable in most languages. Always check if in-place
modification is allowed.

Palindrome check: use two pointers from both ends, compare characters
moving inward. O(n) time, O(1) space.

Anagram check: sort both strings and compare, or use a frequency
map (character count array of size 26 for lowercase English).

KMP algorithm finds a pattern in a string in O(n+m) using a failure
function to avoid redundant comparisons.

Sliding window for longest substring without repeating characters:
expand right pointer, shrink left when duplicate found, track max length.