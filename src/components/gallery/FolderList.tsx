import { FolderOpen, Plus, Trash2, Lock, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Folder {
  id: string;
  name: string;
  cover_image_url: string | null;
  preview_image_url?: string | null;
  created_by?: string;
  created_at: string;
  is_locked?: boolean;
}

interface FolderListProps {
  folders: Folder[];
  isAdmin: boolean;
  currentUserId?: string;
  onSelect: (folderId: string) => void;
  onCreate: () => void;
  onDelete: (folderId: string) => void;
  onManagePin: (folderId: string) => void;
}

const FolderList = ({ folders, isAdmin, currentUserId, onSelect, onCreate, onDelete, onManagePin }: FolderListProps) => {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-display font-semibold text-foreground">Folders</h2>
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={onCreate} className="gap-2">
            <Plus className="w-4 h-4" />
            New Folder
          </Button>
        )}
      </div>

      {folders.length === 0 ? (
        <p className="text-muted-foreground text-sm font-body">No folders yet</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {folders.map((folder) => (
            <div
              key={folder.id}
              className="group relative glass-card rounded-xl overflow-hidden cursor-pointer hover-lift"
            >
              <div
                className="aspect-square flex items-center justify-center bg-secondary relative"
                onClick={() => onSelect(folder.id)}
              >
                {folder.is_locked ? (
                  <>
                    {folder.preview_image_url && (
                      <img
                        src={folder.preview_image_url}
                        alt={folder.name}
                        className="absolute inset-0 w-full h-full object-cover blur-md scale-110 opacity-40"
                      />
                    )}
                    <div className="relative flex flex-col items-center gap-2 text-muted-foreground">
                      <Lock className="w-10 h-10" />
                      <span className="text-xs font-body">Locked</span>
                    </div>
                  </>
                ) : folder.preview_image_url ? (
                  <img src={folder.preview_image_url} alt={folder.name} className="w-full h-full object-cover" />
                ) : (
                  <FolderOpen className="w-12 h-12 text-muted-foreground" />
                )}

                {folder.is_locked && (
                  <div className="absolute top-2 left-2 p-1.5 rounded-full bg-background/80 backdrop-blur-sm">
                    <Lock className="w-3 h-3 text-foreground" />
                  </div>
                )}

                {(() => {
                  const canManagePin = isAdmin || (currentUserId && folder.created_by === currentUserId);
                  const canDelete = isAdmin || (currentUserId && folder.created_by === currentUserId);
                  if (!canManagePin && !canDelete) return null;
                  return (
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {canManagePin && (
                        <button
                          className="p-1.5 rounded-full bg-foreground/80 text-background hover:bg-foreground"
                          onClick={(e) => { e.stopPropagation(); onManagePin(folder.id); }}
                          title="Set / change PIN"
                        >
                          <KeyRound className="w-3 h-3" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          className="p-1.5 rounded-full bg-destructive/80 text-destructive-foreground hover:bg-destructive"
                          onClick={(e) => { e.stopPropagation(); onDelete(folder.id); }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>
              <div className="p-2 text-center">
                <p className="text-sm font-body font-medium text-foreground truncate">{folder.name}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FolderList;
