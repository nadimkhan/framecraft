'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  MoreHorizontal, 
  Plus, 
  Folder, 
  Trash2, 
  Eye,
  Loader2,
} from 'lucide-react';

interface BatchProgress {
  total: number;
  ready: number;
  failed: number;
  generating: number;
  percentage: number;
}

interface Batch {
  id: string;
  name: string;
  description: string | null;
  contentMode: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  progress: BatchProgress;
}

export default function BatchesPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newBatch, setNewBatch] = useState({
    name: '',
    description: '',
    contentMode: 'single',
  });

  useEffect(() => {
    fetchBatches();
  }, []);

  const fetchBatches = async () => {
    try {
      const res = await fetch('/api/batches');
      const data = await res.json();
      setBatches(data);
    } catch (error) {
      console.error('Error fetching batches:', error);
    } finally {
      setLoading(false);
    }
  };

  const createBatch = async () => {
    if (!newBatch.name.trim()) return;
    
    try {
      const res = await fetch('/api/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBatch),
      });
      
      if (res.ok) {
        setIsCreateOpen(false);
        setNewBatch({ name: '', description: '', contentMode: 'single' });
        fetchBatches();
      }
    } catch (error) {
      console.error('Error creating batch:', error);
    }
  };

  const deleteBatch = async (id: string) => {
    if (!confirm('Are you sure you want to delete this batch? Videos will be preserved but unlinked.')) {
      return;
    }
    
    try {
      const res = await fetch(`/api/batches/${id}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        fetchBatches();
      }
    } catch (error) {
      console.error('Error deleting batch:', error);
    }
  };

  const getContentModeLabel = (mode: string) => {
    switch (mode) {
      case 'single':
        return 'Single Video';
      case 'series':
        return 'Series';
      case 'long_form':
        return 'Long Form';
      case 'calendar':
        return 'Calendar';
      default:
        return mode;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Batches</h1>
          <p className="text-muted-foreground mt-1">
            Manage your video batches
          </p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Batch
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Batch</DialogTitle>
              <DialogDescription>
                Create a new batch to organize your videos
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Batch Name</Label>
                <Input
                  id="name"
                  value={newBatch.name}
                  onChange={(e) => setNewBatch({ ...newBatch, name: e.target.value })}
                  placeholder="Enter batch name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Input
                  id="description"
                  value={newBatch.description}
                  onChange={(e) => setNewBatch({ ...newBatch, description: e.target.value })}
                  placeholder="Enter description"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contentMode">Content Mode</Label>
                <Select
                  value={newBatch.contentMode}
                  onValueChange={(value) => setNewBatch({ ...newBatch, contentMode: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single Video</SelectItem>
                    <SelectItem value="series">Series</SelectItem>
                    <SelectItem value="long_form">Long Form</SelectItem>
                    <SelectItem value="calendar">Calendar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={createBatch} className="w-full">
                Create Batch
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Batches</CardTitle>
          <CardDescription>
            View and manage all your video batches
          </CardDescription>
        </CardHeader>
        <CardContent>
          {batches.length === 0 ? (
            <div className="text-center py-8">
              <Folder className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No batches yet</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => setIsCreateOpen(true)}
              >
                Create your first batch
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Videos</TableHead>
                  <TableHead>Ready</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell className="font-medium">
                      <Link 
                        href={`/dashboard/batches/${batch.id}`}
                        className="hover:underline"
                      >
                        {batch.name}
                      </Link>
                      {batch.description && (
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {batch.description}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>{getContentModeLabel(batch.contentMode)}</TableCell>
                    <TableCell>{batch.progress?.total || 0}</TableCell>
                    <TableCell>
                      {batch.progress?.ready || 0}
                    </TableCell>
                    <TableCell>
                      {new Date(batch.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/batches/${batch.id}`}>
                              <Eye className="h-4 w-4 mr-2" />
                              View
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-red-600"
                            onClick={() => deleteBatch(batch.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
