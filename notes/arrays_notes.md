# Arrays

Arrays store elements in contiguous memory. Access is O(1) by index.

The two-pointer technique uses two indices moving toward each other to
solve problems like reversing an array or checking palindromes in O(n)
without extra space.

The sliding window technique maintains a subarray of fixed or variable
size as it slides across the input. Useful for max subarray sum,
longest substring without repeating characters.

Kadane's algorithm finds the maximum subarray sum in O(n) by tracking
the best sum ending at each position.

Prefix sums allow range sum queries in O(1) after O(n) preprocessing.
Store cumulative sums so any subarray sum is prefix[r] - prefix[l-1].