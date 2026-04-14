import { FolderOpen, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Folder {
  id: string;
  name: string;
  cover_image_url: string | null;
  created_at: string;
}

interface FolderListProps {
  folders: Folder[];
  isAdmin: boolean;
  onSelect: (folderId: string) => void;
  onCreate: () => void;
  onDelete: (folderId: string) => void;
}

const FolderList = ({ folders, isAdmin, onSelect, onCreate, onDelete }: FolderListProps) => {
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
                className="aspect-square flex items-center justify-center bg-secondary"
                onClick={() => onSelect(folder.id)}
              >
                {folder.cover_image_url ? (
                  <img src={folder.cover_image_url} alt={folder.name} className="w-full h-full object-cover" />
                ) : (
                  <FolderOpen className="w-12 h-12 text-muted-foreground" />
                )}
                {isAdmin && (
                  <button
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-destructive/80 text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => { e.stopPropagation(); onDelete(folder.id); }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
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
