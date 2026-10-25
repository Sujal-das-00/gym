package app.gymboo.member

import android.content.ActivityNotFoundException
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.IOException

/**
 * Adds the "app.gymboo/downloads" channel (see _savePdf in lib/main.dart):
 *   save {name, mime, bytes} → content:// URI of the file in Downloads, or null
 *                              where the app can't write there (Android 9 and older)
 *   open {uri, mime}         → true if an app opened the file
 */
class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "app.gymboo/downloads")
            .setMethodCallHandler { call, result ->
                try {
                    when (call.method) {
                        "save" -> result.success(
                            save(
                                call.argument<String>("name")!!,
                                call.argument<String>("mime")!!,
                                call.argument<ByteArray>("bytes")!!,
                            )?.toString()
                        )
                        "open" -> result.success(
                            open(Uri.parse(call.argument<String>("uri")!!), call.argument<String>("mime")!!)
                        )
                        else -> result.notImplemented()
                    }
                } catch (error: Exception) {
                    result.error("download_failed", error.message, null)
                }
            }
    }

    // MediaStore lets an app add files to Downloads without any storage permission,
    // but only from Android 10. Older versions would need WRITE_EXTERNAL_STORAGE.
    private fun save(name: String, mime: String, bytes: ByteArray): Uri? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return null
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(MediaStore.MediaColumns.MIME_TYPE, mime)
            put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
            // Hidden from other apps until it is fully written.
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
            ?: throw IOException("Could not create the file in Downloads")
        try {
            contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
                ?: throw IOException("Could not write the file")
            values.clear()
            values.put(MediaStore.MediaColumns.IS_PENDING, 0)
            contentResolver.update(uri, values, null, null)
        } catch (error: Exception) {
            contentResolver.delete(uri, null, null)
            throw error
        }
        return uri
    }

    private fun open(uri: Uri, mime: String): Boolean = try {
        startActivity(
            Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, mime)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        )
        true
    } catch (error: ActivityNotFoundException) {
        false
    }
}
