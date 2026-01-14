# TODO
## Assets
### Asset Type Attributes
- [] Setup trigger that will enforce the no override of a global asset type attribue

### Asset Attribute Values
- [] Ensure users can override attributes on a per asset, per worksapce basis
- [] Setup trigger that will enforce values being locked to global

### Asset Type Status
- [] Setup Asset Type statuses

### Asset Type Documents
- [] Setup Asset Type Document

## Notifications
- [] Setup a global notification system that will send alerts to user via the app

## Trialing
- [] Setup logging to ensure that all events done via API are logged in a central table that is queryable
    - [] This should be extendable to where it could also be logged via tasks

## Users
- [] Setup ability for users to have MFA devices
- [] Setup groups, roles, something like that


## Frontend Specific
### Map
- [] Setup a generic wrapper that will hold things like the filter, the drawer, the assets that are currently loaded and then setup with the idea that we'll have different "engines" for mapping