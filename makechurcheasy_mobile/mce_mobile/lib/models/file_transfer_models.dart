import 'package:file_picker/file_picker.dart';

enum FileTransferDestination { receiver }

extension FileTransferDestinationLabel on FileTransferDestination {
  String get wireValue => 'receiver';
}

class LocalSendTransferFile {
  final String id;
  final PlatformFile file;
  final String mimeType;

  const LocalSendTransferFile({
    required this.id,
    required this.file,
    required this.mimeType,
  });
}

class LocalSendUploadBatch {
  final String sessionId;
  final List<LocalSendTransferFile> files;
  final Map<String, String> tokens;

  const LocalSendUploadBatch({
    required this.sessionId,
    required this.files,
    required this.tokens,
  });
}

class LocalSendUploadedFile {
  final String transferId;
  final String fileName;
  final String storedFileName;
  final int fileSize;
  final String fileType;
  final FileTransferDestination destination;
  final String displayPath;
  final String? pendingId;
  final String? sha256;

  const LocalSendUploadedFile({
    required this.transferId,
    required this.fileName,
    required this.storedFileName,
    required this.fileSize,
    required this.fileType,
    required this.destination,
    required this.displayPath,
    this.pendingId,
    this.sha256,
  });

  factory LocalSendUploadedFile.fromJson(
    Map<String, dynamic> json, {
    required String transferId,
  }) {
    return LocalSendUploadedFile(
      transferId: transferId,
      fileName: json['fileName'] as String? ?? '',
      storedFileName: json['storedFileName'] as String? ?? '',
      fileSize: (json['fileSize'] as num?)?.toInt() ?? 0,
      fileType: json['fileType'] as String? ?? 'application/octet-stream',
      destination: FileTransferDestination.receiver,
      displayPath: json['displayPath'] as String? ?? '',
      pendingId: json['pendingId'] as String?,
      sha256: json['sha256'] as String?,
    );
  }
}
