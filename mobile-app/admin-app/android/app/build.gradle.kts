import java.util.Properties

plugins {
    id("com.android.application")
    // Flutter Gradle plugin
    id("dev.flutter.flutter-gradle-plugin")
}

// Release signing key (android/key.properties, never committed). Without it,
// release builds fall back to the debug key: fine for testing, not for Play.
val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
val hasReleaseKey = keystorePropertiesFile.exists()
if (hasReleaseKey) keystorePropertiesFile.inputStream().use { keystoreProperties.load(it) }

// Meta (Facebook) App ID + Client token (android/facebook.properties, never committed,
// or the FACEBOOK_APP_ID / FACEBOOK_CLIENT_TOKEN environment variables).
val facebookProperties = Properties()
rootProject.file("facebook.properties").takeIf { it.exists() }?.inputStream()?.use { facebookProperties.load(it) }
val facebookAppId = (facebookProperties.getProperty("facebookAppId") ?: System.getenv("FACEBOOK_APP_ID") ?: "").trim()
val facebookClientToken = (facebookProperties.getProperty("facebookClientToken") ?: System.getenv("FACEBOOK_CLIENT_TOKEN") ?: "").trim()
if (facebookAppId.isEmpty() || facebookClientToken.isEmpty()) {
    throw GradleException("Meta App ID / Client token missing: copy android/facebook.properties.example to android/facebook.properties and fill it in.")
}

android {
    namespace = "app.gymboo.gym_boo"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // The Play Store listing (shown as "Simple Gym Manager"). Never change it.
        applicationId = "app.gymboo.gym_boo"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Version comes from pubspec.yaml (or --build-name / --build-number)
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        // String resources, because the Facebook SDK rejects a bare numeric App ID in the manifest.
        resValue("string", "facebook_app_id", facebookAppId)
        resValue("string", "facebook_client_token", facebookClientToken)
    }

    buildFeatures {
        resValues = true // facebook_app_id / facebook_client_token, see defaultConfig
    }

    signingConfigs {
        if (hasReleaseKey) {
            create("release") {
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName(if (hasReleaseKey) "release" else "debug")
            // R8: strip unused Java/Kotlin code and unused resources.
            isMinifyEnabled = true
            isShrinkResources = true
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
