module {
  public type ExternalBlob = {
    id : Text;
    url : Text;
    size : Nat;
    contentType : Text;
  };

  public type StorageState = {
    var blobs : [(Text, ExternalBlob)];
  };

  public func new() : StorageState {
    { var blobs = [] };
  };
};
