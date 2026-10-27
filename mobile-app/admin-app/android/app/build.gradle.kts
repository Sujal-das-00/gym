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
