import React, { useState, useEffect } from 'react';
import { Button } from '../../components/button';
import { Input } from '../../components/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/table';
import { useToast } from '../../components/use-toast';
import { dummyUserManager } from '../models/DummyUser';

export const UserManagementPanel = ({ integrations = [] }) => {
  const [users, setUsers] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    refreshUsers();
  }, []);

  const refreshUsers = () => {
    setUsers(dummyUserManager.readAll());
  };

  const handleCreateUser = (formData) => {
    const user = dummyUserManager.create({
      email: formData.email,
      name: formData.name,
      password: formData.password || 'test123',
      metadata: { role: formData.role || 'user' }
    });
    
    refreshUsers();
    setIsCreateDialogOpen(false);
    
    toast({
      title: 'User Created',
      description: `User ${user.name} has been created successfully`
    });
  };

  const handleUpdateUser = (userId, updates) => {
    dummyUserManager.update(userId, updates);
    refreshUsers();
    setEditingUser(null);
    
    toast({
      title: 'User Updated',
      description: 'User information has been updated'
    });
  };

  const handleDeleteUser = (userId) => {
    const user = dummyUserManager.read(userId);
    if (window.confirm(`Are you sure you want to delete ${user.name}?`)) {
      dummyUserManager.delete(userId);
      refreshUsers();
      
      toast({
        title: 'User Deleted',
        description: `User ${user.name} has been deleted`
      });
    }
  };

  const handleAddIntegration = (userId, integrationName) => {
    const user = dummyUserManager.read(userId);
    user.addIntegration(integrationName, {
      access_token: `test_token_${Date.now()}`,
      refresh_token: `test_refresh_${Date.now()}`,
      expires_at: new Date(Date.now() + 3600000) // 1 hour
    });
    
    refreshUsers();
    
    toast({
      title: 'Integration Added',
      description: `${integrationName} has been connected for ${user.name}`
    });
  };

  const UserForm = ({ user, onSubmit, onCancel }) => {
    const [formData, setFormData] = useState({
      email: user?.email || '',
      name: user?.name || '',
      password: '',
      role: user?.metadata?.role || 'user'
    });

    const handleSubmit = (e) => {
      e.preventDefault();
      onSubmit(formData);
    };

    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <Input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Name</label>
          <Input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Password {user ? '(leave blank to keep current)' : ''}
          </label>
          <Input
            type="password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            {...(!user && { required: true })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Role</label>
          <select
            className="w-full px-3 py-2 border rounded-md"
            value={formData.role}
            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
            <option value="developer">Developer</option>
          </select>
        </div>
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit">
            {user ? 'Update' : 'Create'} User
          </Button>
        </div>
      </form>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Dummy Users</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              dummyUserManager.generateTestUsers(5);
              refreshUsers();
              toast({
                title: 'Test Users Generated',
                description: '5 test users have been created'
              });
            }}
          >
            Generate Test Users
          </Button>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>Create User</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New User</DialogTitle>
              </DialogHeader>
              <UserForm
                onSubmit={handleCreateUser}
                onCancel={() => setIsCreateDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Integrations</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>{user.name}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                <span className="px-2 py-1 bg-gray-100 rounded text-sm">
                  {user.metadata?.role || 'user'}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {Object.keys(user.integrations).map(integration => (
                    <span
                      key={integration}
                      className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs"
                    >
                      {integration}
                    </span>
                  ))}
                  {Object.keys(user.integrations).length === 0 && (
                    <span className="text-gray-400 text-sm">None</span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Dialog
                    open={editingUser?.id === user.id}
                    onOpenChange={(open) => !open && setEditingUser(null)}
                  >
                    <DialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingUser(user)}
                      >
                        Edit
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Edit User</DialogTitle>
                      </DialogHeader>
                      <UserForm
                        user={user}
                        onSubmit={(formData) => handleUpdateUser(user.id, formData)}
                        onCancel={() => setEditingUser(null)}
                      />
                    </DialogContent>
                  </Dialog>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline">
                        Add Integration
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {integrations.map(integration => (
                        <DropdownMenuItem
                          key={integration.name}
                          onClick={() => handleAddIntegration(user.id, integration.name)}
                          disabled={user.integrations[integration.name]}
                        >
                          {integration.name}
                          {user.integrations[integration.name] && ' (Connected)'}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDeleteUser(user.id)}
                  >
                    Delete
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {users.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No users found. Create a user or generate test users to get started.
        </div>
      )}
    </div>
  );
};