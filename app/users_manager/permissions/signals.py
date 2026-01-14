"""
Django signals for automatic cache invalidation.

When memberships or roles change, the permission cache is automatically invalidated.
"""

from django.db.models.signals import post_save, post_delete, m2m_changed
from django.dispatch import receiver


def _get_permission_cache():
    """Lazy import to avoid circular imports."""
    from users_manager.permissions.caching import permission_cache
    return permission_cache


# =============================================================================
# Group Membership Changes
# =============================================================================

@receiver(post_save, sender='users_manager.GroupMembership')
def invalidate_cache_on_group_membership_save(sender, instance, **kwargs):
    """Invalidate user's cache when added to a group."""
    _get_permission_cache().invalidate_user(instance.user_id)


@receiver(post_delete, sender='users_manager.GroupMembership')
def invalidate_cache_on_group_membership_delete(sender, instance, **kwargs):
    """Invalidate user's cache when removed from a group."""
    _get_permission_cache().invalidate_user(instance.user_id)


# =============================================================================
# Organization Membership Changes
# =============================================================================

@receiver(post_save, sender='users_manager.OrganizationMember')
def invalidate_cache_on_org_member_save(sender, instance, **kwargs):
    """Invalidate user's cache when org membership changes."""
    _get_permission_cache().invalidate_user(instance.user_id)


@receiver(post_delete, sender='users_manager.OrganizationMember')
def invalidate_cache_on_org_member_delete(sender, instance, **kwargs):
    """Invalidate user's cache when removed from org."""
    _get_permission_cache().invalidate_user(instance.user_id)


@receiver(post_save, sender='users_manager.OrganizationGroupMember')
def invalidate_cache_on_org_group_member_save(sender, instance, **kwargs):
    """Invalidate all group members' cache when group added to org."""
    _get_permission_cache().invalidate_group(instance.group_id)


@receiver(post_delete, sender='users_manager.OrganizationGroupMember')
def invalidate_cache_on_org_group_member_delete(sender, instance, **kwargs):
    """Invalidate all group members' cache when group removed from org."""
    _get_permission_cache().invalidate_group(instance.group_id)


# =============================================================================
# Workspace Membership Changes
# =============================================================================

@receiver(post_save, sender='users_manager.WorkspaceMember')
def invalidate_cache_on_ws_member_save(sender, instance, **kwargs):
    """Invalidate user's cache when workspace membership changes."""
    _get_permission_cache().invalidate_user(instance.user_id)


@receiver(post_delete, sender='users_manager.WorkspaceMember')
def invalidate_cache_on_ws_member_delete(sender, instance, **kwargs):
    """Invalidate user's cache when removed from workspace."""
    _get_permission_cache().invalidate_user(instance.user_id)


@receiver(post_save, sender='users_manager.WorkspaceGroupMember')
def invalidate_cache_on_ws_group_member_save(sender, instance, **kwargs):
    """Invalidate all group members' cache when group added to workspace."""
    _get_permission_cache().invalidate_group(instance.group_id)


@receiver(post_delete, sender='users_manager.WorkspaceGroupMember')
def invalidate_cache_on_ws_group_member_delete(sender, instance, **kwargs):
    """Invalidate all group members' cache when group removed from workspace."""
    _get_permission_cache().invalidate_group(instance.group_id)


# =============================================================================
# Role Permission Changes
# =============================================================================

def invalidate_cache_on_role_permissions_change(sender, instance, action, **kwargs):
    """Invalidate cache when a role's permissions are modified."""
    if action in ('post_add', 'post_remove', 'post_clear'):
        _get_permission_cache().invalidate_role(instance.id)


def connect_m2m_signals():
    """
    Connect m2m_changed signals that can't use string references.
    Call this from AppConfig.ready().
    """
    from users_manager.models import Role
    m2m_changed.connect(
        invalidate_cache_on_role_permissions_change,
        sender=Role.permissions.through,
    )


@receiver(post_save, sender='users_manager.Role')
def invalidate_cache_on_role_save(sender, instance, **kwargs):
    """Invalidate cache when a role is modified."""
    _get_permission_cache().invalidate_role(instance.id)


@receiver(post_delete, sender='users_manager.Role')
def invalidate_cache_on_role_delete(sender, instance, **kwargs):
    """Invalidate cache when a role is deleted."""
    _get_permission_cache().invalidate_role(instance.id)
