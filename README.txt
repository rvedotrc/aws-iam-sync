Sync IAM users/groups/roles/policies.

e.g. for handling JML

Things it should be able to do:

 - dry-run mode

 - only-apply-matching-changes mode?

 - create/update/delete managed policies

 - create/update/delete roles (name+path)
   - set role's inline policies (but "none" would do)
   - set role's attached policies

 - create/update/delete groups
   - set group's inline policies (but "none" would do)
   - set group's attached policies

 - create/update/delete users
   - set user's inline policies (but "none" would do)
   - set user's attached policies
   - set user's group memberships

In case case, need list of entities (and all their properties),
as well as some predicate for "is entity within this domain".
All wanted entities must match this predicate.
Found entities that match the predicate that aren't wanted will be deleted.

Create in the above order; delete in reverse order.

node --use-strict aws-iam-sync.js -w ./path/to/wanted.json -s ./path/to/scope.js [-n]
